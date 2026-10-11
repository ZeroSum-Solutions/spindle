// Test-only access to the local Supabase stack: public clients, the service
// client and read-only SQL. Never import this from application code.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// CI exports the public values; locally they come from apps/web/.env.local.
const envFile = path.join(__dirname, "..", "..", ".env.local");
if (!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && existsSync(envFile)) process.loadEnvFile(envFile);

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
export const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set; see docs/TESTING.md`);
  return value;
}

/** One HTTP call a test client made: method, path and status only (no headers, query or body). */
export type Call = { method: string; path: string; status: number };

function options(calls?: Call[]) {
  const auth = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
  if (!calls) return { auth };
  const recording: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);
    const request = input instanceof Request ? input : null;
    const url = new URL(request ? request.url : String(input));
    calls.push({ method: (init?.method ?? request?.method ?? "GET").toUpperCase(), path: url.pathname, status: response.status });
    return response;
  };
  return { auth, global: { fetch: recording } };
}

/** A signed-out client with the publishable key, as a browser would have. Pass `calls` to record statuses. */
export function anonClient(calls?: Call[]): SupabaseClient {
  return createClient(SUPABASE_URL, required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), options(calls));
}

/**
 * The local stack's service-role client. The key comes from `supabase status`
 * into this process's environment only (SPINDLE_TEST_SERVICE_ROLE_KEY); never
 * log it, and keep traces off in specs that use it (they record headers).
 */
export function serviceClient(calls?: Call[]): SupabaseClient {
  return createClient(SUPABASE_URL, required("SPINDLE_TEST_SERVICE_ROLE_KEY"), options(calls));
}

/** Runs SQL as the local postgres user; the script travels on stdin, never argv. Returns tab-separated rows. */
export function sql(script: string): string[][] {
  const out = execFileSync("psql", [DB_URL, "-X", "-q", "-At", "-F", "\t", "-v", "ON_ERROR_STOP=1"], {
    input: script,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 60_000,
  });
  return out
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => line.split("\t"));
}

/**
 * Runs SQL inside a transaction that always rolls back. Returns the database
 * error as "message @ context" (the raising function), or null on success.
 */
export function sqlErrorInRollback(script: string): string | null {
  try {
    sql(`begin;\n${script}\nrollback;`);
    return null;
  } catch (error) {
    const stderr = String((error as { stderr?: string }).stderr ?? "");
    const message = /ERROR:\s+(.*)/.exec(stderr)?.[1];
    const context = /CONTEXT:\s+(.*)/.exec(stderr)?.[1];
    return message ? `${message} @ ${context ?? "no context"}` : stderr.trim();
  }
}

/** A SQL string literal. */
export const lit = (value: string) => `'${value.replaceAll("'", "''")}'`;

/** What a run owns, named before anything is created so a lost response cannot hide a row. */
export type RunScope = {
  emails: string[];
  slugs: string[];
  /** SQL predicate on storage.objects matching exactly this run's objects; "false" if none. */
  objects: string;
};

const textArray = (values: string[]) => `array[${values.map(lit).join(",") || "null"}]::text[]`;

/** What is left of a run, found by its names rather than by ids learned during the run. */
export function residue(scope: RunScope) {
  const users = `(select id from auth.users where email = any(${textArray(scope.emails)}))`;
  const orgs = `(select id from public.orgs where slug = any(${textArray(scope.slugs)}))`;
  const [row] = sql(`select
    (select count(*) from ${users} u),
    (select count(*) from auth.sessions where user_id in ${users}),
    (select count(*) from auth.refresh_tokens where user_id::uuid in ${users}),
    (select count(*) from ${orgs} o),
    (select count(*) from public.memberships where org_id in ${orgs} or user_id in ${users}),
    (select count(*) from public.invites where org_id in ${orgs}),
    (select count(*) from storage.objects where ${scope.objects})`);
  const [authUsers, sessions, refreshTokens, orgRows, memberships, invites, runObjects] = row!.map(Number);
  return { authUsers, sessions, refreshTokens, orgs: orgRows, memberships, invites, runObjects };
}

/**
 * Removes a run's fixtures in dependency order: storage objects, sessions,
 * orgs, then users. Every step, and every bucket and user within a step, is
 * attempted on its own; failures are collected and reported with the exact
 * residue, and any failure or residue throws.
 */
export async function cleanupRun(scope: RunScope): Promise<void> {
  const errors: string[] = [];
  const attempt = async (step: string, run: () => Promise<void>) => {
    try {
      await run();
    } catch (error) {
      errors.push(`${step}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  let service: SupabaseClient | undefined;
  let users: { id: string; email: string }[] = [];
  let orgIds: string[] = [];
  let objects: string[][] = [];
  await attempt("service client", async () => {
    service = serviceClient();
  });
  await attempt("resolve users", async () => {
    users = sql(`select id, email from auth.users where email = any(${textArray(scope.emails)}) order by id`).map(
      ([id, email]) => ({ id: id!, email: email! }),
    );
  });
  await attempt("resolve orgs", async () => {
    orgIds = orgIdsBySlug(scope.slugs);
  });
  await attempt("resolve objects", async () => {
    objects = sql(`select bucket_id, name from storage.objects where ${scope.objects}`);
  });

  for (const bucket of new Set(objects.map(([bk]) => bk!))) {
    await attempt(`objects ${bucket}`, async () => {
      const names = objects.filter(([bk]) => bk === bucket).map(([, name]) => name!);
      const { data, error } = await service!.storage.from(bucket).remove(names);
      if (error) throw new Error(error.message);
      if (data?.length !== names.length) throw new Error(`removed ${data?.length} of ${names.length}`);
    });
  }

  // Revoke every session: sign each user in once more through a one-time link
  // (no mail is sent) and sign out with global scope.
  for (const { email } of users) {
    await attempt(`revoke ${email}`, async () => {
      const link = await service!.auth.admin.generateLink({ type: "magiclink", email });
      if (link.error) throw new Error(link.error.message);
      const client = anonClient();
      const verified = await client.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "magiclink" });
      if (verified.error) throw new Error(verified.error.message);
      const out = await client.auth.signOut({ scope: "global" });
      if (out.error) throw new Error(out.error.message);
    });
  }
  await attempt("sessions revoked", async () => {
    const { sessions, refreshTokens } = residue(scope);
    if (sessions + refreshTokens > 0) throw new Error(`${sessions} sessions, ${refreshTokens} refresh tokens remain`);
  });

  if (orgIds.length > 0) {
    await attempt("orgs", async () => {
      const { error, count } = await service!.from("orgs").delete({ count: "exact" }).in("id", orgIds);
      if (error) throw new Error(error.message);
      if (count !== orgIds.length) throw new Error(`removed ${count} of ${orgIds.length}`);
    });
  }
  for (const { id } of users) {
    await attempt(`user ${id}`, async () => {
      const { error } = await service!.auth.admin.deleteUser(id);
      if (error) throw new Error(error.message);
    });
  }

  let left: ReturnType<typeof residue> | string;
  try {
    left = residue(scope);
  } catch (error) {
    left = `unknown: ${error instanceof Error ? error.message : String(error)}`;
  }
  if (errors.length > 0 || typeof left === "string" || Object.values(left).some((n) => n !== 0)) {
    throw new Error(`cleanup incomplete: ${JSON.stringify({ errors, residue: left })}`);
  }
}

/** Ids of existing orgs with exactly these slugs. */
export function orgIdsBySlug(slugs: string[]): string[] {
  if (slugs.length === 0) return [];
  return sql(`select id from public.orgs where slug = any(array[${slugs.map(lit).join(",")}]) order by id`).map(
    ([id]) => id!,
  );
}

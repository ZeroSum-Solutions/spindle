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

/** Exact ids of run-owned users and orgs that still exist, plus their sessions and refresh tokens. */
export function residue(userIds: string[], orgIds: string[]) {
  const users = `array[${userIds.map(lit).join(",") || "null"}]::uuid[]`;
  const orgs = `array[${orgIds.map(lit).join(",") || "null"}]::uuid[]`;
  const [row] = sql(`select
    (select count(*) from auth.users where id = any(${users})),
    (select count(*) from auth.sessions where user_id = any(${users})),
    (select count(*) from auth.refresh_tokens where user_id = any(${users}::text[])),
    (select count(*) from public.orgs where id = any(${orgs})),
    (select count(*) from public.memberships where org_id = any(${orgs}) or user_id = any(${users})),
    (select count(*) from public.invites where org_id = any(${orgs})),
    (select count(*) from storage.objects where bucket_id = 'org-media' and private.path_org(name) = any(${orgs}))`);
  const [authUsers, sessions, refreshTokens, orgRows, memberships, invites, orgObjects] = row!.map(Number);
  return { authUsers, sessions, refreshTokens, orgs: orgRows, memberships, invites, orgObjects };
}

/** What a run owns, named before anything is created so a lost response cannot hide a row. */
export type RunScope = {
  emails: string[];
  slugs: string[];
  /** SQL predicate on storage.objects matching exactly this run's objects; "false" if none. */
  objects: string;
};

/**
 * Removes a run's fixtures in dependency order: storage objects, sessions,
 * orgs, then users. Every step is attempted; failures are collected and
 * reported with the exact residue, and any failure or residue throws.
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
  const userIds = userIdsByEmail(scope.emails);
  const orgIds = orgIdsBySlug(scope.slugs);
  const service = serviceClient();

  await attempt("objects", async () => {
    const rows = sql(`select bucket_id, name from storage.objects where ${scope.objects}`);
    for (const bucket of new Set(rows.map(([bk]) => bk!))) {
      const names = rows.filter(([bk]) => bk === bucket).map(([, name]) => name!);
      const { data, error } = await service.storage.from(bucket).remove(names);
      if (error) throw new Error(`${bucket}: ${error.message}`);
      if (data?.length !== names.length) throw new Error(`${bucket}: removed ${data?.length} of ${names.length}`);
    }
  });

  // Revoke every session: sign each user in once more through a one-time link
  // (no mail is sent) and sign out with global scope.
  for (const email of scope.emails.filter((e) => userIdsByEmail([e]).length > 0)) {
    await attempt(`revoke ${email}`, async () => {
      const link = await service.auth.admin.generateLink({ type: "magiclink", email });
      if (link.error) throw new Error(link.error.message);
      const client = anonClient();
      const verified = await client.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "magiclink" });
      if (verified.error) throw new Error(verified.error.message);
      const out = await client.auth.signOut({ scope: "global" });
      if (out.error) throw new Error(out.error.message);
    });
  }
  await attempt("sessions revoked", async () => {
    const { sessions, refreshTokens } = residue(userIds, []);
    if (sessions + refreshTokens > 0) throw new Error(`${sessions} sessions, ${refreshTokens} refresh tokens remain`);
  });

  if (orgIds.length > 0) {
    await attempt("orgs", async () => {
      const { error, count } = await service.from("orgs").delete({ count: "exact" }).in("id", orgIds);
      if (error) throw new Error(error.message);
      if (count !== orgIds.length) throw new Error(`removed ${count} of ${orgIds.length}`);
    });
  }
  for (const id of userIds) {
    await attempt(`user ${id}`, async () => {
      const { error } = await service.auth.admin.deleteUser(id);
      if (error) throw new Error(error.message);
    });
  }

  const [[objects]] = sql(`select count(*) from storage.objects where ${scope.objects}`) as [[string]];
  const left = { ...residue(userIds, orgIds), runObjects: Number(objects) };
  if (errors.length > 0 || Object.values(left).some((n) => n !== 0)) {
    throw new Error(`cleanup incomplete: ${JSON.stringify({ errors, residue: left })}`);
  }
}

/** Ids of existing users with exactly these addresses (no pattern matching). */
export function userIdsByEmail(emails: string[]): string[] {
  if (emails.length === 0) return [];
  return sql(`select id from auth.users where email = any(array[${emails.map(lit).join(",")}]) order by id`).map(
    ([id]) => id!,
  );
}

/** Ids of existing orgs with exactly these slugs. */
export function orgIdsBySlug(slugs: string[]): string[] {
  if (slugs.length === 0) return [];
  return sql(`select id from public.orgs where slug = any(array[${slugs.map(lit).join(",")}]) order by id`).map(
    ([id]) => id!,
  );
}

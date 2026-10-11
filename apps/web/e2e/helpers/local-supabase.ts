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

const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

/** A signed-out client with the publishable key, as a browser would have. */
export function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), noSession);
}

/**
 * The local stack's service-role client. The key comes from `supabase status`
 * into this process's environment only (SPINDLE_TEST_SERVICE_ROLE_KEY); never
 * log it, and keep traces off in specs that use it (they record headers).
 */
export function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, required("SPINDLE_TEST_SERVICE_ROLE_KEY"), noSession);
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

/**
 * Deletes exactly the given run-owned orgs, then users, through the service
 * APIs. Deleting a user removes its sessions and refresh tokens. Storage
 * objects must already be gone. Throws on any failure; the caller asserts residue.
 */
export async function deleteRunRows(service: SupabaseClient, userIds: string[], orgIds: string[]) {
  if (orgIds.length > 0) {
    const { error, count } = await service.from("orgs").delete({ count: "exact" }).in("id", orgIds);
    if (error) throw new Error(`org cleanup failed: ${error.message}`);
    if (count !== orgIds.length) throw new Error(`org cleanup removed ${count} of ${orgIds.length}`);
  }
  for (const id of userIds) {
    const { error } = await service.auth.admin.deleteUser(id);
    if (error) throw new Error(`user cleanup failed: ${error.message}`);
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

// Guards for the evidence scripts, which write to a database and keep private
// files. Pure, so they are unit-tested.
import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

const PLAIN = /^[A-Za-z0-9_]{1,63}$/;
const SHARED_PORT = "54322";

/**
 * psql arguments from a database URL the scripts may use: loopback only, no
 * URL parameters, plain names, and never the shared local stack (:54322)
 * unless SPINDLE_ALLOW_SHARED_DB=1 is set by the lead after admission.
 * The child environment drops every inherited PG* variable.
 */
export function psqlTarget(url: string | undefined, env: Readonly<Record<string, string | undefined>>): { args: string[]; env: Record<string, string> } {
  if (!url) throw new Error("set SPINDLE_DB_URL to an isolated local database");
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("SPINDLE_DB_URL is not a URL");
  }
  if (u.protocol !== "postgresql:" && u.protocol !== "postgres:") throw new Error("SPINDLE_DB_URL must be postgresql://");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(u.hostname)) throw new Error(`refusing a non-local database (${u.hostname})`);
  if (u.search || u.hash) throw new Error("refusing database URL parameters");
  const port = u.port || "5432";
  if (port === SHARED_PORT && env.SPINDLE_ALLOW_SHARED_DB !== "1") {
    throw new Error("refusing the shared local stack on :54322 (the lead sets SPINDLE_ALLOW_SHARED_DB=1 after admission)");
  }
  const user = decodeURIComponent(u.username) || "postgres";
  const database = decodeURIComponent(u.pathname.slice(1)) || "postgres";
  if (!PLAIN.test(user) || !PLAIN.test(database) || !/^\d{1,5}$/.test(port)) throw new Error("refusing an unusual database user, name or port");
  const clean = Object.fromEntries(Object.entries(env).filter((e): e is [string, string] => !e[0].startsWith("PG") && e[1] !== undefined));
  return {
    args: ["-h", u.hostname.replace(/^\[(.*)\]$/, "$1"), "-p", port, "-U", user, "-d", database, "-w", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"],
    env: { ...clean, PGPASSWORD: decodeURIComponent(u.password), PGCONNECT_TIMEOUT: "5", PGOPTIONS: "-c statement_timeout=60s -c lock_timeout=10s" },
  };
}

/** The real path of the nearest existing ancestor, with the rest appended (the directory may not exist yet). */
function realpathOfNearest(p: string): string {
  let head = resolve(p);
  const tail: string[] = [];
  while (!existsSync(head)) {
    tail.unshift(head.slice(dirname(head).length + 1));
    head = dirname(head);
  }
  return join(realpathSync.native(head), ...tail);
}

function nearestExisting(p: string): string {
  let head = resolve(p);
  while (!existsSync(head)) head = dirname(head);
  return head;
}

function insideGitWorkTree(p: string): boolean {
  try {
    return execFileSync("git", ["-C", nearestExisting(p), "rev-parse", "--is-inside-work-tree"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() === "true";
  } catch {
    return false;
  }
}

/**
 * Private outputs (abstracts, packets, raw answers) must live outside the public repository and
 * outside any git work tree (another checkout of the same repository included). Paths are compared
 * as real paths, so case differences and symlinks do not slip through.
 */
export function privateDir(
  dir: string | undefined,
  repoRoot: string,
  name: string,
  opts: { realpath?: (p: string) => string; insideGit?: (p: string) => boolean } = {},
): string {
  if (!dir) throw new Error(`set ${name} to a private directory outside the repository`);
  if (!isAbsolute(dir)) throw new Error(`${name} must be an absolute path`);
  const real = opts.realpath ?? realpathOfNearest;
  const rel = relative(real(resolve(repoRoot)), real(resolve(dir)));
  const outside = rel === ".." || rel.startsWith(`..${"/"}`) || isAbsolute(rel);
  if (!outside) throw new Error(`${name} is inside the repository; private files never go there`);
  if ((opts.insideGit ?? insideGitWorkTree)(resolve(dir))) throw new Error(`${name} is inside a git work tree; private files never go there`);
  return resolve(dir);
}

export function requireUuid(value: string | undefined, name: string): string {
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) throw new Error(`${name} must be a lowercase uuid`);
  return value;
}

// Shared plumbing for the evidence scripts: guarded psql, private directories, arguments.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { privateDir, psqlTarget, requireUuid } from "../../src/guards";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

const target = () => psqlTarget(process.env.SPINDLE_DB_URL, process.env);

/** Runs SQL as the database owner; returns trimmed unaligned output. Never logs values. */
export function sql(text: string): string {
  const t = target();
  try {
    return execFileSync("psql", t.args, {
      input: text,
      encoding: "utf8",
      env: t.env as NodeJS.ProcessEnv,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (e) {
    const stderr = String((e as { stderr?: unknown }).stderr ?? "");
    throw new Error(stderr.split("\n").find((l) => l.startsWith("ERROR")) ?? "psql failed");
  }
}

export const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;
export const AS_SERVICE = `select set_config('role', 'service_role', true), set_config('request.jwt.claims', '{"role":"service_role"}', true);`;

/** One value from a service-role statement in its own committed transaction. */
export function serviceValue(expr: string): string {
  const out = sql(`begin;\n${AS_SERVICE}\nselect ${expr};\ncommit;`).split("\n");
  return out[out.length - 1] ?? "";
}

export function publisherId(): string {
  return requireUuid(process.env.SPINDLE_PUBLISHER_ID, "SPINDLE_PUBLISHER_ID");
}

export function dir(name: "SPINDLE_EVIDENCE_DIR" | "SPINDLE_REVIEW_DIR"): string {
  const d = privateDir(process.env[name], REPO_ROOT, name);
  mkdirSync(d, { recursive: true, mode: 0o700 });
  return d;
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/** `--name value` and `--flag` arguments. */
export function args(argv = process.argv.slice(2)): { get(name: string): string | undefined; has(name: string): boolean; positional: string[] } {
  const positional: string[] = [];
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) positional.push(a);
    else if (i + 1 < argv.length && !argv[i + 1]!.startsWith("--")) values.set(a.slice(2), argv[++i]!);
    else flags.add(a.slice(2));
  }
  return { get: (n) => values.get(n), has: (n) => flags.has(n) || values.has(n), positional };
}

export function evidencePath(sourceId: string): string {
  return join(dir("SPINDLE_EVIDENCE_DIR"), `source-${requireUuid(sourceId, "source id")}.json`);
}

export function main(fn: () => Promise<number>): void {
  fn().then(
    (code) => process.exit(code),
    (e: unknown) => {
      console.error(`error: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(2);
    },
  );
}

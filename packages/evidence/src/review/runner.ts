// The codex exec runner. The reviewer gets a credential-free environment, an
// empty working directory, a read-only sandbox, no user config (so no MCP
// servers or tools), and only the bounded prompt on stdin.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ReviewRunner, RunnerOutput } from "./harness";

/** Only these variables reach the reviewer process. Codex reads its own login from CODEX_HOME (or ~/.codex). */
const ENV_ALLOW = ["PATH", "HOME", "CODEX_HOME", "LANG", "LC_ALL", "TMPDIR"] as const;

export function reviewerEnv(parent: Readonly<Record<string, string | undefined>>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const k of ENV_ALLOW) {
    const v = parent[k];
    if (v !== undefined) env[k] = v;
  }
  return env;
}

export interface CodexOptions {
  model?: string;
  effort?: "high" | "xhigh";
  timeoutMs?: number;
  codexBin?: string;
}

export function codexArgs(dir: string, schemaFile: string, outFile: string, opts: CodexOptions = {}): string[] {
  return [
    "exec",
    "--json",
    "--skip-git-repo-check",
    "--ignore-user-config",
    "--ignore-rules",
    "-s",
    "read-only",
    "-C",
    dir,
    "-m",
    opts.model ?? "gpt-6.1-sol",
    "-c",
    `model_reasoning_effort="${opts.effort ?? "xhigh"}"`,
    "-c",
    'service_tier="priority"',
    "--output-schema",
    schemaFile,
    "-o",
    outFile,
    "-",
  ];
}

/** The thread id from codex's JSONL events (`thread.started`). */
export function sessionFromEvents(stdout: string): string {
  for (const line of stdout.split("\n")) {
    try {
      const e = JSON.parse(line) as { type?: string; thread_id?: string; session_id?: string };
      if (e.type === "thread.started" && (e.thread_id ?? e.session_id)) return (e.thread_id ?? e.session_id)!;
    } catch {
      // not an event line
    }
  }
  return "";
}

export function codexRunner(opts: CodexOptions = {}): ReviewRunner {
  return {
    async run(prompt, outputSchema): Promise<RunnerOutput> {
      const dir = await mkdtemp(join(tmpdir(), "spindle-review-"));
      try {
        const schemaFile = join(dir, "schema.json");
        const outFile = join(dir, "answer.json");
        await writeFile(schemaFile, JSON.stringify(outputSchema));
        const { code, stdout } = await new Promise<{ code: number; stdout: string }>((resolve, reject) => {
          const child = spawn(opts.codexBin ?? "codex", codexArgs(dir, schemaFile, outFile, opts), {
            cwd: dir,
            env: reviewerEnv(process.env),
            stdio: ["pipe", "pipe", "pipe"],
          });
          let out = "";
          child.stdout.on("data", (d: Buffer) => (out += d.toString("utf8")));
          child.stderr.resume();
          const timer = setTimeout(() => child.kill("SIGTERM"), opts.timeoutMs ?? 30 * 60_000);
          child.on("error", (e) => {
            clearTimeout(timer);
            reject(e);
          });
          child.on("close", (c) => {
            clearTimeout(timer);
            resolve({ code: c ?? -1, stdout: out });
          });
          child.stdin.end(prompt);
        });
        const lastMessage = await readFile(outFile, "utf8").catch(() => "");
        return { lastMessage, model: opts.model ?? "gpt-6.1-sol", session: sessionFromEvents(stdout), exitCode: code };
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
}

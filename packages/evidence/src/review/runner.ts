// The codex exec runner. The reviewer gets a fresh HOME and CODEX_HOME holding
// only its login (no global AGENTS.md, skills, config or other files), an
// allowlisted environment, an empty working directory, a read-only sandbox,
// no user config, the shell, browser, app, plugin and hook features turned
// off, an ephemeral session, and only the bounded prompt on stdin.
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { ReviewRunner, RunnerOutput } from "./harness";

/** Only these variables pass through; HOME and CODEX_HOME always point at the fresh reviewer home. */
const ENV_ALLOW = ["PATH", "LANG", "LC_ALL", "TMPDIR"] as const;

export interface ReviewerHome {
  home: string;
  codexHome: string;
}

export function reviewerEnv(parent: Readonly<Record<string, string | undefined>>, home: ReviewerHome): Record<string, string> {
  const env: Record<string, string> = {};
  for (const k of ENV_ALLOW) {
    const v = parent[k];
    if (v !== undefined) env[k] = v;
  }
  return { ...env, HOME: home.home, CODEX_HOME: home.codexHome };
}

/** A throwaway home whose codex directory holds only a copy of the login (auth.json). */
export function prepareReviewerHome(sourceCodexHome: string): ReviewerHome & { dispose(): void } {
  const auth = join(sourceCodexHome, "auth.json");
  if (!existsSync(auth)) throw new Error(`no codex login (auth.json) in ${sourceCodexHome}`);
  const home = mkdtempSync(join(tmpdir(), "spindle-reviewer-home-"));
  const codexHome = join(home, "codex");
  mkdirSync(codexHome, { mode: 0o700 });
  copyFileSync(auth, join(codexHome, "auth.json"));
  return { home, codexHome, dispose: () => rmSync(home, { recursive: true, force: true }) };
}

/** Tools and integrations the reviewer never needs. It reads only the prompt. */
export const DISABLED_FEATURES = [
  "shell_tool", "unified_exec", "browser_use", "browser_use_external", "in_app_browser", "computer_use", "apps", "plugins",
  "remote_plugin", "hooks", "code_mode_host", "skill_search", "tool_suggest", "goals", "sleep_tool", "view_image",
  "image_generation", "multi_agent", "memories", "browser_use_full_cdp_access", "browser_annotation_api", "in_app_local_automation",
  "unified_exec_tty", "workspace_dependencies", "skill_mcp_dependency_install",
] as const;

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
    "--ephemeral",
    ...DISABLED_FEATURES.flatMap((f) => ["--disable", f]),
    "-c",
    'web_search="disabled"',
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

/** A model name reported in codex's JSONL events, or "" when none is reported. */
export function modelFromEvents(stdout: string): string {
  for (const line of stdout.split("\n")) {
    try {
      const e = JSON.parse(line) as Record<string, unknown>;
      const nested = (e.msg ?? e.item ?? e.session) as Record<string, unknown> | undefined;
      const m = typeof e.model === "string" ? e.model : typeof nested?.model === "string" ? (nested.model as string) : "";
      if (m) return m;
    } catch {
      // not an event line
    }
  }
  return "";
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
      let home: ReturnType<typeof prepareReviewerHome> | null = null;
      try {
        home = prepareReviewerHome(process.env.CODEX_HOME ?? join(homedir(), ".codex"));
        const reviewerHome = home;
        const schemaFile = join(dir, "schema.json");
        const outFile = join(dir, "answer.json");
        await writeFile(schemaFile, JSON.stringify(outputSchema));
        const { code, stdout } = await new Promise<{ code: number; stdout: string }>((resolve, reject) => {
          const child = spawn(opts.codexBin ?? "codex", codexArgs(dir, schemaFile, outFile, opts), {
            cwd: dir,
            env: reviewerEnv(process.env, reviewerHome),
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
        const requested = opts.model ?? "gpt-6.1-sol";
        return { lastMessage, model: modelFromEvents(stdout) || requested, requestedModel: requested, session: sessionFromEvents(stdout), exitCode: code };
      } finally {
        await rm(dir, { recursive: true, force: true });
        home?.dispose();
      }
    },
  };
}

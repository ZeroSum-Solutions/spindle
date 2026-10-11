/**
 * Thin orchestration for publishing one base module from its drafts (docs/curriculum/PUBLISHING.md).
 * It adds no rule of its own: every step calls an existing script or publisher RPC, and the
 * database gate decides. Subcommands, in runbook order:
 *   sources --manifest content/<m>/sources.json
 *       ingest.ts --add-source per source (with its D-12 override and D-13 full-text sections), then
 *       excerpt.ts per D-13 publisher excerpt (text from SPINDLE_EXCERPT_DIR, never the repo). Exit 1 if any
 *       source is blocked or refused.
 *   claims --drafts content/<m>/drafts --state <dir>
 *       publisher_add_claim per claim slot (statement, evidenceLevel, population, domain, ingested sources).
 *       Writes <dir>/claims.json (slot -> claim id) and <dir>/claim-ids.txt. Reuses a recorded claim while its
 *       statement, metadata and sources are unchanged.
 *   course --module content/<m>/module.json --drafts content/<m>/drafts --state <dir>
 *       Builds the course tree (stable UUIDv5 ids from the module key and lesson ids; claim slots replaced by
 *       claim ids) and saves it with publisher_save_course_draft. Writes <dir>/course-id.txt.
 * Then review.ts / record-review.ts / publish.ts as the runbook shows.
 * Needs SPINDLE_DB_URL, SPINDLE_PUBLISHER_ID; sources also SPINDLE_CONTACT_EMAIL, SPINDLE_EVIDENCE_DIR and
 * SPINDLE_EXCERPT_DIR. Exit 0 done, 1 refused or blocked, 2 error.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { requireUuid } from "../src/guards";
import { AS_SERVICE, args, dir, evidencePath, lit, main, publisherId, readJson, sql, writeJson } from "./lib/cli";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Stable ids, so a re-run (and the final shared publish) addresses the same course, parts and lessons. */
const NAMESPACE = "6f1c2c0e-1d3a-4c55-9a37-5b1e0d4a7c21";
export function uuidV5(name: string, namespace = NAMESPACE): string {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const h = createHash("sha1").update(Buffer.concat([ns, Buffer.from(name, "utf8")])).digest();
  h[6] = (h[6]! & 0x0f) | 0x50;
  h[8] = (h[8]! & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

const sourceSchema = z.strictObject({
  doi: z.string().min(1),
  pmid: z.string().regex(/^\d{1,9}$/).optional(),
  citation: z.string().optional(),
  kindOverride: z.string().optional(),
  justification: z.string().optional(),
  fullText: z.array(z.string().min(1)).optional(),
  excerpts: z.array(z.strictObject({ file: z.string().regex(/^[\w.-]+$/), locator: z.string().min(1), attribution: z.string().min(1) })).optional(),
});
const manifestSchema = z.strictObject({ module: z.string(), note: z.string().optional(), sources: z.array(sourceSchema) });

const slotSchema = z.object({
  slot: z.string().startsWith("claim-slot:"),
  statement: z.string().min(1),
  domain: z.enum(["foundation", "applied"]),
  evidenceLevel: z.string().min(1).max(100),
  population: z.string().min(1).max(500),
  candidateSources: z.array(z.object({ doi: z.string().optional(), pmid: z.union([z.string(), z.number()]).optional() })).min(1),
});
const draftSchema = z.object({ lesson: z.object({ id: z.string().min(1), blocks: z.array(z.unknown()) }).passthrough(), claimSlots: z.array(slotSchema) });

function drafts(path: string) {
  return readdirSync(path)
    .filter((f) => /^\d{2}-.*\.json$/.test(f))
    .sort()
    .map((f) => ({ file: f, number: f.slice(0, 2), draft: draftSchema.parse(JSON.parse(readFileSync(join(path, f), "utf8"))) }));
}

function tsx(script: string, argv: string[]): number {
  try {
    execFileSync(process.execPath, [join(HERE, "../node_modules/tsx/dist/cli.mjs"), join(HERE, script), ...argv], { stdio: ["ignore", "inherit", "inherit"] });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 2;
  }
}

function sourceId(doi: string): string | null {
  return sql(`select coalesce((select id::text from public.sources where doi = ${lit(doi.toLowerCase())}), '')`) || null;
}

function sources(manifestPath: string): number {
  const m = manifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf8")));
  const excerptDir = dir("SPINDLE_EXCERPT_DIR");
  let failed = 0;
  for (const s of m.sources) {
    const argv = [...(s.pmid ? ["--pmid", s.pmid] : ["--doi", s.doi]), "--add-source"];
    if (s.kindOverride) argv.push("--kind-override", s.kindOverride, "--justification", s.justification ?? "");
    if (s.fullText?.length) argv.push("--full-text", s.fullText.join("|"));
    console.log(`## ${s.doi}`);
    if (tsx("ingest.ts", argv) !== 0) {
      failed++;
      continue;
    }
    const id = sourceId(s.doi);
    if (!id) {
      failed++;
      continue;
    }
    for (const x of s.excerpts ?? []) {
      const entry = readJson<{ excerpts?: { locator: string }[] }>(evidencePath(id));
      if ((entry.excerpts ?? []).some((e) => e.locator === x.locator)) {
        console.log(`  excerpt at ${x.locator}: already present`);
        continue;
      }
      const file = join(excerptDir, x.file);
      if (!existsSync(file)) {
        console.log(`  refused: excerpt file ${x.file} is missing from SPINDLE_EXCERPT_DIR`);
        failed++;
        continue;
      }
      if (tsx("excerpt.ts", ["--source", id, "--locator", x.locator, "--attribution", x.attribution, "--file", file]) !== 0) failed++;
    }
  }
  console.log(failed ? `${failed} source step(s) blocked or refused` : `all ${m.sources.length} sources ready`);
  return failed ? 1 : 0;
}

type ClaimState = Record<string, { claimId: string; fingerprint: string }>;

function claims(draftsPath: string, stateDir: string): number {
  const p = publisherId();
  const statePath = join(stateDir, "claims.json");
  const state: ClaimState = existsSync(statePath) ? readJson<ClaimState>(statePath) : {};
  let blocked = 0;
  for (const { draft } of drafts(draftsPath)) {
    for (const s of draft.claimSlots) {
      const ids = s.candidateSources.map((c) => (c.doi ? sourceId(c.doi) : null));
      if (ids.some((i) => !i)) {
        console.log(`blocked ${s.slot}: a candidate source is not ingested`);
        blocked++;
        continue;
      }
      const body = { statement: s.statement, evidenceLevel: s.evidenceLevel, population: s.population, domain: s.domain, sourceIds: (ids as string[]).sort() };
      const fingerprint = createHash("sha256").update(JSON.stringify(body)).digest("hex");
      const known = state[s.slot];
      if (known && known.fingerprint === fingerprint && sql(`select count(*) from public.claims where id = ${lit(requireUuid(known.claimId, "claim id"))}`) === "1") continue;
      const id = sql(`begin;\n${AS_SERVICE}\nselect public.publisher_add_claim(${lit(p)}, ${lit(JSON.stringify(body))}::jsonb);\ncommit;`).split("\n").pop()!;
      state[s.slot] = { claimId: requireUuid(id, "claim id"), fingerprint };
      console.log(`claim ${s.slot} -> ${id}`);
    }
  }
  writeJson(statePath, state);
  writeFileSync(join(stateDir, "claim-ids.txt"), Object.values(state).map((c) => c.claimId).join(","), { mode: 0o600 });
  console.log(`${Object.keys(state).length} claims recorded in ${statePath}`);
  return blocked ? 1 : 0;
}

const moduleSchema = z.strictObject({
  key: z.string().regex(/^[a-z0-9-]+$/),
  slug: z.string().min(1),
  layer: z.literal("base"),
  title: z.string().min(1),
  subtitle: z.string(),
  description: z.string(),
  level: z.enum(["foundation", "intermediate", "advanced"]),
  outcomes: z.array(z.string().min(1)),
  parts: z.array(z.strictObject({ key: z.string().min(1), title: z.string().min(1), summary: z.string(), lessons: z.array(z.string().regex(/^\d{2}$/)).min(1) })).min(1),
});

/** Replaces claim-slot ids in a block with claim ids; refuses an unknown slot. */
function bindBlock(block: unknown, state: ClaimState): unknown {
  const b = block as { claimIds?: string[] };
  if (!b.claimIds?.length) return block;
  return {
    ...b,
    claimIds: b.claimIds.map((c) => {
      if (!c.startsWith("claim-slot:")) return c;
      const known = state[c];
      if (!known) throw new Error(`no claim recorded for ${c}; run the claims step first`);
      return known.claimId;
    }),
  };
}

function course(modulePath: string, draftsPath: string, stateDir: string): number {
  const m = moduleSchema.parse(JSON.parse(readFileSync(modulePath, "utf8")));
  const state = readJson<ClaimState>(join(stateDir, "claims.json"));
  const byNumber = new Map(drafts(draftsPath).map((d) => [d.number, d.draft]));
  const courseId = uuidV5(`course:${m.key}`);
  const tree = {
    id: courseId,
    slug: m.slug,
    layer: m.layer,
    title: m.title,
    subtitle: m.subtitle,
    description: m.description,
    level: m.level,
    outcomes: m.outcomes,
    parts: m.parts.map((part, i) => ({
      id: uuidV5(`part:${m.key}:${part.key}`),
      ordinal: i + 1,
      title: part.title,
      summary: part.summary,
      lessons: part.lessons.map((n) => {
        const d = byNumber.get(n);
        if (!d) throw new Error(`no draft numbered ${n}`);
        const { id, blocks, ...rest } = d.lesson as { id: string; blocks: unknown[] } & Record<string, unknown>;
        return { ...rest, id: uuidV5(`lesson:${m.key}:${id}`), blocks: blocks.map((b) => bindBlock(b, state)) };
      }),
    })),
  };
  const saved = sql(`begin;\n${AS_SERVICE}\nselect public.publisher_save_course_draft(${lit(publisherId())}, ${lit(JSON.stringify(tree))}::jsonb);\ncommit;`).split("\n").pop()!;
  if (saved !== courseId) throw new Error(`the database saved ${saved}, not ${courseId}`);
  writeFileSync(join(stateDir, "course-id.txt"), courseId, { mode: 0o600 });
  console.log(`course draft ${courseId} saved (${tree.parts.reduce((n, p) => n + p.lessons.length, 0)} lessons)`);
  return 0;
}

main(async () => {
  const a = args();
  const [cmd] = a.positional;
  const root = (p: string | undefined, name: string) => {
    if (!p) throw new Error(`--${name} is required`);
    return resolve(p);
  };
  if (cmd === "sources") return sources(root(a.get("manifest"), "manifest"));
  if (cmd === "claims") return claims(root(a.get("drafts"), "drafts"), dir("SPINDLE_MODULE_STATE_DIR"));
  if (cmd === "course") return course(root(a.get("module"), "module"), root(a.get("drafts"), "drafts"), dir("SPINDLE_MODULE_STATE_DIR"));
  throw new Error("usage: module.ts sources --manifest <file> | claims --drafts <dir> | course --module <file> --drafts <dir>");
});

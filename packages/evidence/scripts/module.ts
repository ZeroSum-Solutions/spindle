/**
 * Thin orchestration for publishing one base module from its drafts (docs/curriculum/PUBLISHING.md).
 * It adds no rule of its own beyond refusing stale or ambiguous drafts early (src/module.ts); every
 * step calls an existing script or publisher RPC, and the database gate decides. Subcommands, in order:
 *   sources --manifest content/<m>/sources.json
 *       ingest.ts --add-source per source, with both its DOI and PMID, its D-12 override and D-13 full-text
 *       sections; then excerpt.ts per D-13 publisher excerpt (text from SPINDLE_EXCERPT_DIR, never the repo).
 *       An identical stored excerpt is reused; a different one at the same locator is refused.
 *   claims --drafts content/<m>/drafts
 *       One claim per current slot (publisher_add_claim), checkpointed after each. Writes
 *       $SPINDLE_MODULE_STATE_DIR/claims.json and claim-ids.txt for the current slots only.
 *   course --module content/<m>/module.json --drafts content/<m>/drafts
 *       Saves the course tree (publisher_save_course_draft) with UUIDv5 ids, binding each slot to its claim only
 *       if the slot is unchanged since the claims step. Writes $SPINDLE_MODULE_STATE_DIR/course-id.txt.
 * Then review.ts / record-review.ts / publish.ts as the runbook shows.
 * Needs SPINDLE_DB_URL and SPINDLE_PUBLISHER_ID; sources also SPINDLE_CONTACT_EMAIL, SPINDLE_EVIDENCE_DIR and
 * SPINDLE_EXCERPT_DIR; claims and course SPINDLE_MODULE_STATE_DIR. Exit 0 done, 1 refused or blocked, 2 error.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { Excerpt } from "../src/fulltext";
import { requireUuid } from "../src/guards";
import { bindCourse, collectSlots, excerptAction, loadDrafts, syncClaims, type Candidate, type ClaimBody, type ClaimDeps, type ClaimState } from "../src/module";
import { AS_SERVICE, args, dir, evidencePath, lit, main, publisherId, readJson, sql, writeJson } from "./lib/cli";

const HERE = dirname(fileURLToPath(import.meta.url));

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

function tsx(script: string, argv: string[]): number {
  try {
    execFileSync(process.execPath, [join(HERE, "../node_modules/tsx/dist/cli.mjs"), join(HERE, script), ...argv], { stdio: ["ignore", "inherit", "inherit"] });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 2;
  }
}

/** The ingested source for a candidate: by DOI (its stored PMID must agree when both are known), or by PMID alone. */
function resolveSource(c: Candidate): string | null {
  if (c.doi) {
    const row = sql(`select coalesce((select json_build_object('id', id, 'pmid', pmid) from public.sources where doi = ${lit(c.doi)}), 'null')`);
    const hit = JSON.parse(row) as { id: string; pmid: string | null } | null;
    if (!hit || (c.pmid && hit.pmid && hit.pmid !== c.pmid)) return null;
    return hit.id;
  }
  const ids = sql(`select coalesce(string_agg(id::text, ','), '') from public.sources where pmid = ${lit(c.pmid!)}`);
  return ids && !ids.includes(",") ? ids : null;
}

function sources(manifestPath: string): number {
  const m = manifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf8")));
  const excerptDir = dir("SPINDLE_EXCERPT_DIR");
  let failed = 0;
  for (const s of m.sources) {
    const argv = ["--doi", s.doi, ...(s.pmid ? ["--pmid", s.pmid] : []), "--add-source"];
    if (s.kindOverride) argv.push("--kind-override", s.kindOverride, "--justification", s.justification ?? "");
    if (s.fullText?.length) argv.push("--full-text", s.fullText.join("|"));
    console.log(`## ${s.doi}`);
    if (tsx("ingest.ts", argv) !== 0) {
      failed++;
      continue;
    }
    const id = resolveSource({ doi: s.doi.toLowerCase(), ...(s.pmid ? { pmid: s.pmid } : {}) });
    if (!id) {
      console.log(`  refused: no ingested source matches DOI ${s.doi}${s.pmid ? ` and PMID ${s.pmid}` : ""}`);
      failed++;
      continue;
    }
    for (const x of s.excerpts ?? []) {
      const entry = readJson<{ excerpts?: Excerpt[] }>(evidencePath(id));
      const file = join(excerptDir, x.file);
      const action = excerptAction(entry.excerpts ?? [], x, existsSync(file) ? readFileSync(file, "utf8") : null);
      if (action === "reuse") console.log(`  excerpt at ${x.locator}: identical, kept`);
      else if (action === "add") {
        if (tsx("excerpt.ts", ["--source", id, "--locator", x.locator, "--attribution", x.attribution, "--file", file]) !== 0) failed++;
      } else {
        console.log(`  refused: ${action}`);
        failed++;
      }
    }
  }
  console.log(failed ? `${failed} source step(s) blocked or refused` : `all ${m.sources.length} sources ready`);
  return failed ? 1 : 0;
}

function claimDeps(stateDir: string): ClaimDeps {
  const p = publisherId();
  return {
    resolve: resolveSource,
    claimExists: (id) => sql(`select count(*) from public.claims where id = ${lit(requireUuid(id, "claim id"))}`) === "1",
    findIdentical: (body: ClaimBody) =>
      sql(`select coalesce((select c.id::text from public.claims c
        where c.statement = ${lit(body.statement)} and c.evidence_level = ${lit(body.evidenceLevel)} and c.population = ${lit(body.population)}
          and c.domain = ${lit(body.domain)} and c.created_by = ${lit(p)}
          and (select array_agg(cs.source_id order by cs.source_id) from public.claim_sources cs where cs.claim_id = c.id)
            = array[${body.sourceIds.map((s) => `${lit(requireUuid(s, "source id"))}::uuid`).join(", ")}]
        order by c.created_at limit 1), '')`) || null,
    addClaim: (body) => {
      const id = sql(`begin;\n${AS_SERVICE}\nselect public.publisher_add_claim(${lit(p)}, ${lit(JSON.stringify(body))}::jsonb);\ncommit;`).split("\n").pop()!;
      console.log(`claim created ${id}`);
      return requireUuid(id, "claim id");
    },
    checkpoint: (state: ClaimState) => {
      writeJson(join(stateDir, "claims.json"), state);
      writeFileSync(join(stateDir, "claim-ids.txt"), Object.values(state).map((c) => c.claimId).join(","), { mode: 0o600 });
    },
  };
}

function readDrafts(path: string) {
  return loadDrafts(readdirSync(path).filter((f) => f.endsWith(".json")).map((name) => ({ name, json: JSON.parse(readFileSync(join(path, name), "utf8")) })));
}

function claims(draftsPath: string, stateDir: string): number {
  const statePath = join(stateDir, "claims.json");
  const previous: ClaimState = existsSync(statePath) ? readJson<ClaimState>(statePath) : {};
  const { state, blocked } = syncClaims(collectSlots(readDrafts(draftsPath)), previous, claimDeps(stateDir));
  for (const b of blocked) console.log(`blocked ${b}: a candidate source is not ingested or its identifiers disagree; it has no claim now`);
  console.log(`${Object.keys(state).length} current claims in ${statePath}`);
  return blocked.length ? 1 : 0;
}

function course(modulePath: string, draftsPath: string, stateDir: string): number {
  const drafts = readDrafts(draftsPath);
  const state = readJson<ClaimState>(join(stateDir, "claims.json"));
  const tree = bindCourse(JSON.parse(readFileSync(modulePath, "utf8")), drafts, collectSlots(drafts), state, { resolve: resolveSource }) as { id: string; parts: { lessons: unknown[] }[] };
  const saved = sql(`begin;\n${AS_SERVICE}\nselect public.publisher_save_course_draft(${lit(publisherId())}, ${lit(JSON.stringify(tree))}::jsonb);\ncommit;`).split("\n").pop()!;
  if (saved !== tree.id) throw new Error(`the database saved ${saved}, not ${tree.id}`);
  writeFileSync(join(stateDir, "course-id.txt"), tree.id, { mode: 0o600 });
  console.log(`course draft ${tree.id} saved (${tree.parts.reduce((n, p) => n + p.lessons.length, 0)} lessons)`);
  return 0;
}

main(async () => {
  const a = args();
  const [cmd] = a.positional;
  const path = (name: string) => {
    const v = a.get(name);
    if (!v) throw new Error(`--${name} is required`);
    return resolve(v);
  };
  if (cmd === "sources") return sources(path("manifest"));
  if (cmd === "claims") return claims(path("drafts"), dir("SPINDLE_MODULE_STATE_DIR"));
  if (cmd === "course") return course(path("module"), path("drafts"), dir("SPINDLE_MODULE_STATE_DIR"));
  throw new Error("usage: module.ts sources --manifest <file> | claims --drafts <dir> | course --module <file> --drafts <dir>");
});

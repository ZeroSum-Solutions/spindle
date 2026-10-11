/**
 * Ingests one paper: PubMed metadata, the full abstract from the matching record, and the
 * verifySource receipt. Writes a private evidence file. With --add-source and a ready paper,
 * adds it through publisher_add_source and stores the evidence entry for review packets.
 *   SPINDLE_CONTACT_EMAIL=… SPINDLE_EVIDENCE_DIR=/private/dir pnpm --filter @spindle/evidence exec tsx scripts/ingest.ts --pmid 32571081 [--add-source]
 * --add-source also needs SPINDLE_DB_URL and SPINDLE_PUBLISHER_ID. Exit 0 ready, 1 blocked, 2 error.
 */
import { join } from "node:path";
import { createContext } from "../src/context";
import { ingestPaper } from "../src/ingest";
import type { EvidenceEntry } from "../src/review/packet";
import { AS_SERVICE, args, dir, evidencePath, lit, main, publisherId, sql, writeJson } from "./lib/cli";

main(async () => {
  const a = args();
  const pmid = a.get("pmid");
  const doi = a.get("doi");
  const ctx = createContext();
  ctx.requireEmail();
  const paper = await ingestPaper(ctx, { ...(pmid ? { pmid } : {}), ...(doi ? { doi } : {}) });
  const key = (paper.pmid ? `pmid-${paper.pmid}` : `doi-${(paper.doi ?? "unknown").replace(/[^a-z0-9.]+/g, "_")}`).slice(0, 120);
  writeJson(join(dir("SPINDLE_EVIDENCE_DIR"), `paper-${key}.json`), paper);
  console.log(`${paper.status}: ${paper.doi ?? "no DOI"} pmid=${paper.pmid ?? "none"} kind=${paper.kind ?? "none"} retraction=${paper.retraction}`);
  for (const issue of paper.issues) console.log(`  - ${issue}`);
  if (paper.status !== "ready" || !paper.sourceInput || !paper.abstract || !paper.check) return 1;
  if (!a.has("add-source")) return 0;

  const p = publisherId();
  const out = sql(`begin;\n${AS_SERVICE}\nselect public.publisher_add_source(${lit(p)}, ${lit(JSON.stringify(paper.sourceInput))}::jsonb);\ncommit;`).split("\n");
  const sourceId = out[out.length - 1]!;
  const entry: EvidenceEntry = {
    sourceId,
    kind: paper.sourceInput.kind,
    title: paper.sourceInput.title,
    identifiers: { doi: paper.sourceInput.doi, ...(paper.pmid ? { pmid: paper.pmid } : {}) },
    text: paper.abstract.text,
    textOrigin: paper.abstract.origin,
    retraction: paper.retraction,
    checkedAt: paper.check.checkedAt,
  };
  writeJson(evidencePath(sourceId), entry);
  console.log(`source ${sourceId} added; evidence entry written`);
  return 0;
});

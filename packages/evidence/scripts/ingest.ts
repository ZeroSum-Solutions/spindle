/**
 * Ingests one paper: PubMed metadata, the full abstract from the matching record, and the
 * verifySource receipt. Writes a private evidence file. With --add-source and a ready paper,
 * adds it through publisher_add_source and stores the evidence entry for review packets.
 *   SPINDLE_CONTACT_EMAIL=… SPINDLE_EVIDENCE_DIR=/private/dir pnpm --filter @spindle/evidence exec tsx scripts/ingest.ts --pmid 32571081 [--add-source]
 * --add-source also needs SPINDLE_DB_URL and SPINDLE_PUBLISHER_ID. Exit 0 ready, 1 blocked, 2 error.
 * D-12: for a guidance document PubMed mislabels, add --kind-override <position_stand | clinical_guideline |
 * consensus_statement | care_pathway> --justification "<why, at least 40 characters>". The override is
 * refused when PubMed already types the paper, or types it as a study or a notice; it is stored, audited and
 * shown to the reviewer.
 */
import { join } from "node:path";
import { createContext } from "../src/context";
import { ingestPaper, type KindOverrideType } from "../src/ingest";
import { evidenceMatchesSource, type EvidenceEntry } from "../src/review/packet";
import { AS_SERVICE, args, dir, evidencePath, lit, main, publisherId, sourceIdentities, sql, writeJson } from "./lib/cli";

main(async () => {
  const a = args();
  const pmid = a.get("pmid");
  const doi = a.get("doi");
  const ctx = createContext();
  ctx.requireEmail();
  const overrideType = a.get("kind-override");
  const justification = a.get("justification");
  if ((overrideType === undefined) !== (justification === undefined)) throw new Error("--kind-override <type> and --justification <text> go together");
  const paper = await ingestPaper(ctx, { ...(pmid ? { pmid } : {}), ...(doi ? { doi } : {}) },
    overrideType ? { kindOverride: { documentType: overrideType as KindOverrideType, justification: justification! } } : {});
  const key = (paper.pmid ? `pmid-${paper.pmid}` : `doi-${(paper.doi ?? "unknown").replace(/[^a-z0-9.]+/g, "_")}`).slice(0, 120);
  writeJson(join(dir("SPINDLE_EVIDENCE_DIR"), `paper-${key}.json`), paper);
  console.log(`${paper.status}: ${paper.doi ?? "no DOI"} pmid=${paper.pmid ?? "none"} kind=${paper.kind ?? "none"} retraction=${paper.retraction}`);
  for (const issue of paper.issues) console.log(`  - ${issue}`);
  if (paper.status !== "ready" || !paper.sourceInput || !paper.abstract || !paper.check) return 1;
  if (!a.has("add-source")) return 0;

  const p = publisherId();
  // An existing source keeps its id: only its private evidence entry is refreshed (Sol C02).
  const existing = sql(`select coalesce((select id::text from public.sources where doi = ${lit(paper.sourceInput.doi)}), '')`);
  const sourceId = existing || sql(`begin;\n${AS_SERVICE}\nselect public.publisher_add_source(${lit(p)}, ${lit(JSON.stringify(paper.sourceInput))}::jsonb);\ncommit;`).split("\n").pop()!;
  const entry: EvidenceEntry = {
    sourceId,
    kind: paper.sourceInput.kind,
    title: paper.sourceInput.title,
    identifiers: { doi: paper.sourceInput.doi, ...(paper.pmid ? { pmid: paper.pmid } : {}) },
    text: paper.abstract.text,
    textOrigin: paper.abstract.origin,
    retraction: paper.retraction,
    checkedAt: paper.check.checkedAt,
    ...(paper.year !== undefined ? { year: paper.year } : {}),
    ...(paper.journal ? { journal: paper.journal.slice(0, 500) } : {}),
    ...(paper.sourceInput.kindOverride ? { kindOverride: paper.sourceInput.kindOverride } : {}),
  };
  if (existing) {
    // Refresh only with an entry that matches the existing source's full identity; otherwise keep the old file (Sol N02).
    const identity = sourceIdentities([existing]).get(existing);
    if (!evidenceMatchesSource(entry, identity)) {
      console.log(`refused: the new evidence does not match source ${existing} (kind ${identity?.kind}, DOI ${identity?.doi}, PMID ${identity?.pmid ?? "none"}); the previous evidence file is unchanged`);
      return 1;
    }
  }
  writeJson(evidencePath(sourceId), entry);
  console.log(`source ${sourceId} ${existing ? "already existed; evidence entry refreshed" : "added; evidence entry written"}`);
  return 0;
});

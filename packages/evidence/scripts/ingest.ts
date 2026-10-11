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
 * D-13: --full-text "<section>|<section>" adds the named full-text sections (matched by title) from
 * Europe PMC's open-access copy, only under an open licence, with section locators. A refresh keeps any
 * publisher excerpts (scripts/excerpt.ts) already in the evidence file. Evidence files stay private.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createContext } from "../src/context";
import { getEuropePmcFullText, jatsSections, selectSections, type Excerpt } from "../src/fulltext";
import { ingestPaper, isOpenLicense, type IngestedPaper, type KindOverrideType } from "../src/ingest";
import { evidenceEntrySchema, evidenceMatchesSource, type EvidenceEntry } from "../src/review/packet";
import { AS_SERVICE, args, dir, evidencePath, lit, main, publisherId, readJson, sourceIdentities, sql, writeJson } from "./lib/cli";

/** The open licence full text may be used under: every licence the records give must be open. */
function fullTextLicense(paper: IngestedPaper): string {
  const given = [paper.licenses?.unpaywall, paper.licenses?.europepmc].filter((l): l is string => !!l);
  if (given.length === 0) throw new Error("no licence recorded for this article; full text needs an open licence");
  const closed = given.find((l) => !isOpenLicense(l));
  if (closed) throw new Error(`licence ${JSON.stringify(closed)} is not open (CC BY, CC0 or public domain); use a publisher excerpt instead`);
  return given[0]!;
}

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
    // The stored override is immutable: a refresh carries it, not this run's wording (Sol R1 PR26-04).
    if (identity?.override && entry.kindOverride && identity.override.documentType === entry.kindOverride.documentType) {
      entry.kindOverride = { ...identity.override, documentType: entry.kindOverride.documentType };
    }
    if (!evidenceMatchesSource(entry, identity)) {
      console.log(`refused: the new evidence does not match source ${existing} (kind ${identity?.kind}, DOI ${identity?.doi}, PMID ${identity?.pmid ?? "none"}); the previous evidence file is unchanged`);
      return 1;
    }
  }
  // D-13: keep publisher excerpts from the previous file; add the requested open full-text sections.
  const excerpts: Excerpt[] = [];
  if (existsSync(evidencePath(sourceId))) {
    const previous = readJson<EvidenceEntry>(evidencePath(sourceId));
    excerpts.push(...(previous.excerpts ?? []).filter((x) => x.origin === "publisher-excerpt"));
  }
  const wanted = a.get("full-text");
  if (wanted) {
    let picked: Excerpt[];
    try {
      const license = fullTextLicense(paper);
      if (!paper.pmcid) throw new Error("no PubMed Central copy, so no open full text");
      const xml = await getEuropePmcFullText(ctx, paper.pmcid);
      if (!xml) throw new Error(`Europe PMC has no open full text for ${paper.pmcid}`);
      picked = selectSections(jatsSections(xml), wanted.split("|").map((w) => w.trim()).filter(Boolean), license);
    } catch (e) {
      console.log(`refused full text: ${e instanceof Error ? e.message : String(e)}; the evidence file is unchanged`);
      return 1;
    }
    excerpts.push(...picked);
    for (const x of picked) console.log(`  full text: ${x.locator} (${x.text.length} characters)`);
  }
  if (excerpts.length) entry.excerpts = excerpts;
  writeJson(evidencePath(sourceId), evidenceEntrySchema.parse(entry));
  console.log(`source ${sourceId} ${existing ? "already existed; evidence entry refreshed" : "added; evidence entry written"}`);
  return 0;
});

/**
 * D-13: adds a short publisher excerpt to a source's private evidence file, for a source without
 * an open licence. At most 300 words per source in total, with a page or section locator and an
 * attribution line. The excerpt never enters the repository or any learner-facing table; it exists
 * only for review packets (criticism and review). Sol says when an excerpt is too short.
 *   SPINDLE_EVIDENCE_DIR=/private/dir … tsx scripts/excerpt.ts --source <id> --locator "p. 4, PICO 6" \
 *     --attribution "Pandey RA, et al. BESS Patient Care Pathway: Subacromial Pain. 2025." --file /private/excerpt.txt
 * Exit 0 added, 1 refused, 2 error.
 */
import { existsSync, readFileSync } from "node:fs";
import { publisherExcerpt } from "../src/fulltext";
import { requireUuid } from "../src/guards";
import { evidenceEntrySchema, type EvidenceEntry } from "../src/review/packet";
import { args, evidencePath, main, readJson, writeJson } from "./lib/cli";

main(async () => {
  const a = args();
  const sourceId = requireUuid(a.get("source"), "--source");
  const file = a.get("file");
  const locator = a.get("locator");
  const attribution = a.get("attribution");
  if (!file || !locator || !attribution) throw new Error("--file, --locator and --attribution are required");
  const path = evidencePath(sourceId);
  if (!existsSync(path)) {
    console.log("refused: ingest the source first (ingest.ts --add-source); there is no evidence file to add to");
    return 1;
  }
  const entry = evidenceEntrySchema.parse(readJson<unknown>(path)) as EvidenceEntry;
  let excerpt;
  try {
    excerpt = publisherExcerpt(entry.excerpts ?? [], readFileSync(file, "utf8"), locator, attribution);
  } catch (e) {
    console.log(`refused: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
  const next = evidenceEntrySchema.parse({ ...entry, excerpts: [...(entry.excerpts ?? []), excerpt] });
  writeJson(path, next);
  console.log(`added a ${excerpt.text.split(/\s+/).length}-word excerpt at ${excerpt.locator} to ${sourceId}`);
  return 0;
});

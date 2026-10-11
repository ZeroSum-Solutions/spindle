/**
 * Records small trimmed fixtures from the live APIs into src/__fixtures__/.
 * Run by hand: SPINDLE_CONTACT_EMAIL=you@example.org pnpm --filter @spindle/evidence record
 * Trimming keeps only fields the clients read; abstracts are cut to 300 characters.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext } from "../src/context";

const DOI = "10.1177/0269215520934147"; // Clin Rehabil 2020, rotator cuff exercise SR/MA
const RETRACTED_DOI = "10.1016/s0140-6736(97)11096-0"; // Wakefield 1998, fully retracted
const dir = join(dirname(fileURLToPath(import.meta.url)), "../src/__fixtures__");
mkdirSync(dir, { recursive: true });

type Json = Record<string, unknown>;
const captured: { url: string; body: Json }[] = [];
const capture = async (url: string, init?: RequestInit): Promise<Response> => {
  const res = await fetch(url, init);
  if (res.ok) captured.push({ url, body: (await res.clone().json()) as Json });
  return res;
};
const ctx = createContext({ fetch: capture });
const { searchPubMed, getPubMedSummaries } = await import("../src/pubmed");
const { searchEuropePmc } = await import("../src/europepmc");
const { searchOpenAlex, getOpenAlexByDoi } = await import("../src/openalex");
const { getCrossrefWork } = await import("../src/crossref");
const { getUnpaywall } = await import("../src/unpaywall");
const { getSemanticScholarByDoi } = await import("../src/semanticscholar");
const { lookupAnatomyByUberon } = await import("../src/wikidata");
const { listWgerExercises } = await import("../src/wger");

const pick = (o: Json, keys: string[]): Json => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));
const cut = (s: unknown, n = 300): unknown => (typeof s === "string" ? s.slice(0, n) : s);
const save = (name: string, body: unknown): void => {
  writeFileSync(join(dir, `${name}.json`), `${JSON.stringify(body, null, 2)}\n`);
  console.log("saved", name);
};
const last = (): Json => captured[captured.length - 1]!.body;

const s = await searchPubMed(ctx, "rotator cuff exercise", { max: 2 });
save("pubmed-search", last());
await getPubMedSummaries(ctx, s.pmids.slice(0, 2));
const sum = last().result as Json;
save("pubmed-summary", {
  result: Object.fromEntries(
    Object.entries(sum).map(([k, v]) =>
      k === "uids" ? [k, v] : [k, pick(v as Json, ["uid", "title", "pubdate", "fulljournalname", "source", "pubtype", "articleids"])],
    ),
  ),
});

await searchEuropePmc(ctx, `DOI:"${DOI}"`, { max: 1 });
const ep = last();
const epr = (ep.resultList as { result: Json[] }).result.map((r) => ({
  ...pick(r, ["id", "pmid", "doi", "title", "pubYear", "isOpenAccess", "license", "citedByCount", "journalInfo", "pubTypeList"]),
  abstractText: cut(r.abstractText),
}));
save("europepmc-search", { hitCount: ep.hitCount, resultList: { result: epr } });

await searchOpenAlex(ctx, "rotator cuff exercise", { max: 2, filter: { type: "review", from_publication_date: "2018-01-01" } });
save("openalex-search", last());
await getOpenAlexByDoi(ctx, DOI);
save("openalex-work", last());

const cr = async (doi: string, name: string): Promise<void> => {
  await getCrossrefWork(ctx, doi);
  const m = last().message as Json;
  save(name, { message: pick(m, ["DOI", "title", "container-title", "type", "issued", "relation", "update-to", "updated-by"]) });
};
await cr(DOI, "crossref-work");
await cr(RETRACTED_DOI, "crossref-retracted");

await getUnpaywall(ctx, DOI);
const up = last();
save("unpaywall", {
  ...pick(up, ["doi", "is_oa", "oa_status"]),
  best_oa_location: pick(up.best_oa_location as Json, ["license", "url", "version", "host_type"]),
});
await getSemanticScholarByDoi(ctx, DOI);
save("semanticscholar", pick(last(), ["paperId", "title", "year", "citationCount", "isOpenAccess", "tldr"]));
await lookupAnatomyByUberon(ctx, ["UBERON:0001103"]);
save("wikidata", last());
await listWgerExercises(ctx, { limit: 2 });
const w = last() as { count: number; results: Json[] };
save("wger", {
  count: w.count,
  results: w.results.map((r) => ({
    ...pick(r, ["id", "uuid", "category", "muscles", "muscles_secondary", "equipment", "license", "license_author"]),
    translations: (r.translations as Json[]).map((t) => pick(t, ["name", "language"])),
  })),
});

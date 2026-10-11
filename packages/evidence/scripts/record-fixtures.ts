/**
 * Records small trimmed fixtures from the live APIs into src/__fixtures__/.
 * Run by hand: SPINDLE_CONTACT_EMAIL=you@example.org pnpm --filter @spindle/evidence record
 * Trimming keeps only fields the clients read; abstracts and TLDRs are replaced by synthetic text.
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
/** Run one client call; return the body of exactly the request it made. Fails on null results. */
async function rec<T>(call: () => Promise<T>): Promise<{ result: NonNullable<T>; body: Json }> {
  captured.length = 0;
  const result = await call();
  if (result === null || result === undefined) throw new Error("lookup returned nothing; refusing to save a stale payload");
  const hit = captured[captured.length - 1];
  if (!hit) throw new Error("no successful response captured");
  return { result: result as NonNullable<T>, body: hit.body };
}
const SYNTH_ABSTRACT = "SYNTHETIC ABSTRACT FOR TESTS";
const SYNTH_TLDR = "SYNTHETIC TLDR FOR TESTS";
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

const s = await rec(() => searchPubMed(ctx, "rotator cuff exercise", { max: 2 }));
save("pubmed-search", s.body);
const sumRes = await rec(() => getPubMedSummaries(ctx, s.result.pmids.slice(0, 2)));
const sum = sumRes.body.result as Json;
save("pubmed-summary", {
  result: Object.fromEntries(
    Object.entries(sum).map(([k, v]) =>
      k === "uids" ? [k, v] : [k, pick(v as Json, ["uid", "title", "pubdate", "fulljournalname", "source", "pubtype", "articleids"])],
    ),
  ),
});

const ep = (await rec(() => searchEuropePmc(ctx, `DOI:"${DOI}"`, { max: 1 }))).body;
const epr = (ep.resultList as { result: Json[] }).result.map((r) => ({
  ...pick(r, ["id", "pmid", "doi", "title", "pubYear", "isOpenAccess", "license", "citedByCount", "journalInfo", "pubTypeList"]),
  abstractText: SYNTH_ABSTRACT, // never redistribute real abstracts
}));
save("europepmc-search", { hitCount: ep.hitCount, resultList: { result: epr } });

save("openalex-search", (await rec(() => searchOpenAlex(ctx, "rotator cuff exercise", { max: 2, filter: { type: "review", from_publication_date: "2018-01-01" } }))).body);
save("openalex-work", (await rec(() => getOpenAlexByDoi(ctx, DOI))).body);

const cr = async (doi: string, name: string): Promise<void> => {
  const m = (await rec(() => getCrossrefWork(ctx, doi))).body.message as Json;
  save(name, { message: pick(m, ["DOI", "title", "container-title", "type", "issued", "relation", "update-to", "updated-by"]) });
};
await cr(DOI, "crossref-work");
await cr(RETRACTED_DOI, "crossref-retracted");

const up = (await rec(() => getUnpaywall(ctx, DOI))).body;
save("unpaywall", {
  ...pick(up, ["doi", "is_oa", "oa_status"]),
  best_oa_location: up.best_oa_location ? pick(up.best_oa_location as Json, ["license", "url", "version", "host_type"]) : null,
});
const s2 = (await rec(() => getSemanticScholarByDoi(ctx, DOI))).body;
save("semanticscholar", { ...pick(s2, ["paperId", "title", "year", "citationCount", "isOpenAccess"]), tldr: { text: SYNTH_TLDR } });
save("wikidata", (await rec(() => lookupAnatomyByUberon(ctx, ["UBERON:0001103"]))).body);
const w = (await rec(() => listWgerExercises(ctx, { limit: 2 }))).body as { count: number; results: Json[] };
save("wger", {
  count: w.count,
  results: w.results.map((r) => ({
    ...pick(r, ["id", "uuid", "category", "muscles", "muscles_secondary", "equipment", "license", "license_author"]),
    translations: (r.translations as Json[]).map((t) => pick(t, ["name", "language"])),
  })),
});

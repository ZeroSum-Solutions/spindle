/**
 * Live smoke test. Never runs in CI. Prints one line per API.
 *   SPINDLE_CONTACT_EMAIL=you@example.org pnpm --filter @spindle/evidence smoke
 */
import { createContext } from "../src/context";
import { getCrossrefWork } from "../src/crossref";
import { searchEuropePmc } from "../src/europepmc";
import { getOpenAlexByDoi, searchOpenAlex } from "../src/openalex";
import { getPubMedSummaries, searchPubMed } from "../src/pubmed";
import { getSemanticScholarByDoi } from "../src/semanticscholar";
import { getUnpaywall } from "../src/unpaywall";
import { verifySource } from "../src/verify";
import { listWgerExercises } from "../src/wger";
import { lookupAnatomyByUberon } from "../src/wikidata";

// Clin Rehabil 2020: exercise for rotator cuff related shoulder pain, systematic review and meta-analysis.
const DOI = "10.1177/0269215520934147";
const ctx = createContext();
ctx.requireEmail();

function check(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const steps: [string, () => Promise<string>][] = [
  ["pubmed", async () => {
    const found = await searchPubMed(ctx, "rotator cuff exercise", { max: 3 });
    const works = await getPubMedSummaries(ctx, found.pmids);
    check(works.length > 0, "no PubMed summaries");
    return `${found.total} hits, first PMID ${works[0]?.pmid}`;
  }],
  ["europepmc", async () => {
    const r = await searchEuropePmc(ctx, `DOI:"${DOI}"`, { max: 1 });
    const w = r.works[0];
    check(w, "DOI not found");
    return `isOa=${w.oa.isOa} license=${w.oa.license ?? "none"}`;
  }],
  ["openalex", async () => {
    const s = await searchOpenAlex(ctx, "rotator cuff exercise", { max: 3, filter: { type: "review", from_publication_date: "2018-01-01" } });
    const w = await getOpenAlexByDoi(ctx, DOI);
    check(s.works.length > 0 && w, "no OpenAlex results");
    return `${s.total} reviews, cited_by=${w.citedByCount} retracted=${w.isRetracted} year=${w.year}`;
  }],
  ["crossref", async () => {
    const w = await getCrossrefWork(ctx, DOI);
    check(w, "DOI not found");
    return `"${w.title.slice(0, 48)}..." retracted=${w.isRetracted}`;
  }],
  ["unpaywall", async () => {
    const w = await getUnpaywall(ctx, DOI);
    check(w, "DOI not found");
    return `isOa=${w.isOa} license=${w.license ?? "none"}`;
  }],
  ["semanticscholar", async () => {
    const p = await getSemanticScholarByDoi(ctx, DOI);
    check(p, "paper not found");
    return `citations=${p.citationCount} tldr=${p.tldr ? "yes" : "no"}`;
  }],
  ["wikidata", async () => {
    const [a] = await lookupAnatomyByUberon(ctx, ["UBERON:0001103"]);
    check(a, "no item");
    return `${a.qid} ${a.label} TA98=${a.ta98.join(",") || "-"}`;
  }],
  ["wger", async () => {
    const r = await listWgerExercises(ctx, { limit: 3 });
    check(r.exercises.length > 0, "no exercises");
    return `${r.total} exercises, license ${r.exercises[0]?.license.shortName}`;
  }],
  ["verifySource", async () => {
    const c = await verifySource(ctx, DOI);
    check(c.status === "verified", `status ${c.status}: ${c.issues.join("; ")}`);
    return `status=${c.status} oa=${c.oa.isOa}`;
  }],
];

let failed = 0;
for (const [name, run] of steps) {
  try {
    console.log(`OK    ${name.padEnd(16)} ${await run()}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name.padEnd(16)} ${e instanceof Error ? e.message : String(e)}`);
  }
}
process.exit(failed ? 1 : 0);

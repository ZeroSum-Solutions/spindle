import { describe, expect, it } from "vitest";
import { getCrossrefWork } from "./crossref";
import { normalizeDoi } from "./doi";
import { getEuropePmcByDoi } from "./europepmc";
import { getOpenAlexByDoi, searchOpenAlex } from "./openalex";
import { getPubMedSummaries, searchPubMed } from "./pubmed";
import { getSemanticScholarByDoi } from "./semanticscholar";
import { fixture, testContext } from "./testing";
import { getUnpaywall } from "./unpaywall";
import { listWgerExercises } from "./wger";
import { buildUberonQuery, lookupAnatomyByUberon, parseUberonId } from "./wikidata";

const DOI = "10.1177/0269215520934147";

describe("doi helpers", () => {
  it("normalizes URLs and rejects junk", () => {
    expect(normalizeDoi("https://doi.org/10.1177/ABC")).toBe("10.1177/abc");
    expect(normalizeDoi("doi: 10.1177/abc")).toBe("10.1177/abc");
    expect(normalizeDoi("not a doi")).toBeNull();
  });
});

describe("PubMed", () => {
  it("searches reviews and normalizes summaries", async () => {
    const { ctx, calls } = testContext([
      ["esearch.fcgi", fixture("pubmed-search")],
      ["esummary.fcgi", fixture("pubmed-summary")],
    ]);
    const found = await searchPubMed(ctx, "rotator cuff exercise", { max: 2 });
    expect(found.pmids.length).toBeGreaterThan(0);
    expect(decodeURIComponent(calls[0]!.url)).toContain("meta-analysis[pt]");
    const works = await getPubMedSummaries(ctx, found.pmids);
    expect(works[0]).toMatchObject({ source: "pubmed", pmid: found.pmids[0] });
    expect(works[0]?.title.length).toBeGreaterThan(5);
  });

  it("adds the API key only when set", async () => {
    const { ctx, calls } = testContext([["esearch.fcgi", fixture("pubmed-search")]], { NCBI_API_KEY: "k123" });
    await searchPubMed(ctx, "x");
    expect(calls[0]?.url).toContain("api_key=k123");
  });
});

describe("Europe PMC", () => {
  it("returns open-access state, license and a truncated abstract", async () => {
    const { ctx } = testContext([["europepmc", fixture("europepmc-search")]]);
    const w = await getEuropePmcByDoi(ctx, DOI);
    expect(w).toMatchObject({ source: "europepmc", doi: DOI });
    expect(typeof w?.oa.isOa).toBe("boolean");
    expect(w?.abstract?.length ?? 0).toBeLessThanOrEqual(600);
  });
});

describe("OpenAlex", () => {
  it("searches with filters and sends mailto", async () => {
    const { ctx, calls } = testContext([["api.openalex.org/works?", fixture("openalex-search")]]);
    const { works } = await searchOpenAlex(ctx, "rotator cuff", { filter: { type: "review", from_publication_date: "2018-01-01" } });
    expect(works.length).toBeGreaterThan(0);
    expect(works.every((w) => w.isReview)).toBe(true);
    const url = decodeURIComponent(calls[0]!.url);
    expect(url).toContain("filter=type:review,from_publication_date:2018-01-01");
    expect(url).toContain("mailto=test@example.org");
  });

  it("gets a work by DOI with retraction, citations and OA fields", async () => {
    const { ctx } = testContext([["works/doi:", fixture("openalex-work")]]);
    const w = await getOpenAlexByDoi(ctx, DOI);
    expect(w).toMatchObject({ doi: DOI, isRetracted: false, year: 2020, oa: { isOa: true } });
    expect(w?.citedByCount).toBeGreaterThan(0);
  });

  it("requires the contact email", async () => {
    const { ctx } = testContext([], {});
    await expect(getOpenAlexByDoi(ctx, DOI)).rejects.toThrow(/SPINDLE_CONTACT_EMAIL/);
  });
});

describe("Crossref", () => {
  it("returns title and no retraction for a clean work", async () => {
    const { ctx, calls } = testContext([["api.crossref.org", fixture("crossref-work")]]);
    const w = await getCrossrefWork(ctx, DOI);
    expect(w).toMatchObject({ doi: DOI, isRetracted: false, year: 2020 });
    expect(w?.title).toMatch(/rotator cuff/i);
    expect(calls[0]?.headers["User-Agent"]).toContain("mailto:test@example.org");
  });

  it("detects a retraction from updated-by", async () => {
    const { ctx } = testContext([["api.crossref.org", fixture("crossref-retracted")]]);
    const w = await getCrossrefWork(ctx, "10.1016/s0140-6736(97)11096-0");
    expect(w?.isRetracted).toBe(true);
    expect(w?.retractionNotices).toContain("10.1016/s0140-6736(10)60175-4");
  });

  it("detects relation is-retracted-by and update-to notices", async () => {
    const { ctx } = testContext([
      ["10.1000/orig", { message: { DOI: "10.1000/orig", title: ["T"], relation: { "is-retracted-by": [{ id: "10.1000/notice" }] } } }],
      ["10.1000/notice", { message: { DOI: "10.1000/notice", title: ["R"], "update-to": [{ type: "retraction", DOI: "10.1000/orig" }] } }],
    ]);
    expect(await getCrossrefWork(ctx, "10.1000/orig")).toMatchObject({ isRetracted: true, retractionNotices: ["10.1000/notice"] });
    expect(await getCrossrefWork(ctx, "10.1000/notice")).toMatchObject({ isRetracted: false, isRetractionNotice: true });
  });

  it("returns null for an unknown DOI", async () => {
    const { ctx } = testContext([["api.crossref.org", new Response("Resource not found.", { status: 404 })]]);
    expect(await getCrossrefWork(ctx, "10.1000/none")).toBeNull();
  });
});

describe("Unpaywall", () => {
  it("returns OA state and the best location", async () => {
    const { ctx, calls } = testContext([["api.unpaywall.org", fixture("unpaywall")]]);
    const r = await getUnpaywall(ctx, DOI);
    expect(r).toMatchObject({ doi: DOI, isOa: true });
    expect(r?.url).toMatch(/^https:/);
    expect(calls[0]?.url).toContain("email=test%40example.org");
  });
});

describe("Semantic Scholar", () => {
  it("returns tldr and counts, and sends the key header only when set", async () => {
    const withKey = testContext([["semanticscholar", fixture("semanticscholar")]], {
      SPINDLE_CONTACT_EMAIL: "t@example.org",
      S2_API_KEY: "s2key",
    });
    const p = await getSemanticScholarByDoi(withKey.ctx, DOI);
    expect(p?.tldr).toBeTruthy();
    expect(withKey.calls[0]?.headers["x-api-key"]).toBe("s2key");
    const noKey = testContext([["semanticscholar", fixture("semanticscholar")]]);
    await getSemanticScholarByDoi(noKey.ctx, DOI);
    expect(noKey.calls[0]?.headers["x-api-key"]).toBeUndefined();
  });
});

describe("Wikidata", () => {
  it("looks up an Uberon ID and returns TA98/TA2", async () => {
    const { ctx, calls } = testContext([["query.wikidata.org", fixture("wikidata")]]);
    const [item] = await lookupAnatomyByUberon(ctx, ["UBERON:0001103"]);
    expect(item).toMatchObject({ qid: "Q9654", label: "thoracic diaphragm", uberonId: "UBERON:0001103" });
    expect(item?.ta98).toEqual(["A04.4.02.001"]);
    expect(item?.ta2).toEqual(["2327"]);
    expect(decodeURIComponent(calls[0]!.url)).toContain('"0001103"');
    expect(calls[0]?.headers["User-Agent"]).toContain("Spindle/");
  });

  it("rejects malformed IDs before building a query", () => {
    expect(parseUberonId("UBERON_0001103")).toBe("0001103");
    expect(() => parseUberonId('1" } DROP')).toThrow();
    expect(buildUberonQuery(["0001103"])).toContain("P1554");
  });
});

describe("wger", () => {
  it("returns muscles, equipment and license", async () => {
    const { ctx } = testContext([["wger.de", fixture("wger")]], {});
    const { exercises, total } = await listWgerExercises(ctx, { limit: 2 });
    expect(total).toBeGreaterThan(0);
    expect(exercises[0]?.license.shortName).toMatch(/CC/);
    expect(exercises[0]?.muscles.length).toBeGreaterThan(0);
    expect(exercises[0]?.name).toBeTruthy();
  });
});

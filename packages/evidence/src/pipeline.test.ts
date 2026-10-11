// Synthetic responses only (abstract text is a placeholder). No network.
import { describe, expect, it } from "vitest";
import { DEFAULT_INTERVALS_MS } from "./http";
import { checkYouTubeEmbed, embedRecheckActions, metadataRefreshAction } from "./media";
import { ingestPaper, paperKind } from "./ingest";
import { prepublishDecision, recheckAction, retractionState } from "./retraction";
import { fixture, testContext } from "./testing";
import type { SourceCheck } from "./types";

const DOI = "10.1177/0269215520934147";
const PMID = "32571081";
const ABSTRACT = "SYNTHETIC ABSTRACT FOR TESTS. ".repeat(12);

function epmc(overrides: Record<string, unknown> = {}) {
  return {
    hitCount: 1,
    resultList: {
      result: [{ id: PMID, pmid: PMID, doi: DOI, title: "Synthetic review", pubYear: "2020", abstractText: ABSTRACT,
        pubTypeList: { pubType: ["Meta-Analysis", "Systematic Review", "Journal Article"] }, ...overrides }],
    },
  };
}
const esummary = (doi = DOI, pubtype = ["Meta-Analysis"]) => ({
  result: { uids: [PMID], [PMID]: { uid: PMID, title: "Synthetic review.", pubtype, articleids: [{ idtype: "doi", value: doi }] } },
});
const clean = (extra: [string, unknown][] = []) => [
  ...extra,
  ["api.crossref.org", fixture("crossref-work")],
  ["api.openalex.org", fixture("openalex-work")],
  ["api.unpaywall.org", fixture("unpaywall")],
] as [string, unknown][];

describe("ingestPaper", () => {
  it("is ready with matching identifiers, a full abstract, an admissible kind and a verified source", async () => {
    const { ctx, calls } = testContext(clean([["esummary.fcgi", esummary()], ["europepmc", epmc()]]));
    const paper = await ingestPaper(ctx, { pmid: PMID });
    expect(paper).toMatchObject({ status: "ready", doi: DOI, pmid: PMID, kind: "meta_analysis", retraction: "not_retracted" });
    expect(paper.abstract).toEqual({ text: ABSTRACT.trim(), origin: "europepmc-med" });
    expect(paper.sourceInput).toMatchObject({ kind: "meta_analysis", doi: DOI, pmid: PMID });
    expect(decodeURIComponent(calls.find((c) => c.url.includes("europepmc"))!.url.replace(/\+/g, " "))).toContain(`EXT_ID:${PMID} AND SRC:MED`);
  });

  it("blocks when PubMed and the caller disagree on the DOI", async () => {
    const { ctx } = testContext(clean([["esummary.fcgi", esummary("10.1000/other")], ["europepmc", epmc()]]));
    const paper = await ingestPaper(ctx, { pmid: PMID, doi: DOI });
    expect(paper.status).toBe("blocked");
    expect(paper.issues.join(" ")).toMatch(/lists DOI 10.1000\/other/);
  });

  it("blocks a PMID and DOI that no record ties together", async () => {
    const noDoi = { result: { uids: [PMID], [PMID]: { uid: PMID, title: "Synthetic review.", pubtype: ["Meta-Analysis"], articleids: [] } } };
    const { ctx } = testContext(clean([["esummary.fcgi", noDoi], ["europepmc", epmc({ doi: undefined })]]));
    const paper = await ingestPaper(ctx, { pmid: PMID, doi: DOI });
    expect(paper.status).toBe("blocked");
    expect(paper.issues.join(" ")).toMatch(/no record ties PMID/);
  });

  it("C03/R07: uses PubMed types when the matched Europe PMC record lists none", async () => {
    const { ctx } = testContext(clean([["esummary.fcgi", esummary(DOI, ["Meta-Analysis"])], ["europepmc", epmc({ pubTypeList: undefined })]]));
    expect(await ingestPaper(ctx, { pmid: PMID })).toMatchObject({ status: "ready", kind: "meta_analysis" });
  });

  it("R05: refuses a PubMed record for another PMID", async () => {
    const other = { result: { uids: ["999"], [PMID]: { uid: "999", title: "Other.", pubtype: ["Meta-Analysis"], articleids: [{ idtype: "doi", value: DOI }] } } };
    const { ctx } = testContext(clean([["esummary.fcgi", other], ["europepmc", { hitCount: 0, resultList: { result: [] } }]]));
    const paper = await ingestPaper(ctx, { pmid: PMID });
    expect(paper.status).toBe("blocked");
    expect(paper.issues.join(" ")).toMatch(/PubMed returned PMID 999/);
  });

  it("R06: adopts the DOI from the matching MED record when PubMed lists none", async () => {
    const noDoi = { result: { uids: [PMID], [PMID]: { uid: PMID, title: "Synthetic review.", pubtype: ["Meta-Analysis"], articleids: [] } } };
    const { ctx } = testContext(clean([["esummary.fcgi", noDoi], ["europepmc", epmc()]]));
    expect(await ingestPaper(ctx, { pmid: PMID })).toMatchObject({ status: "ready", doi: DOI });
  });

  it("blocks without a full abstract, and never uses a truncated one", async () => {
    const { ctx } = testContext(clean([["esummary.fcgi", esummary()], ["europepmc", epmc({ abstractText: undefined })]]));
    const paper = await ingestPaper(ctx, { pmid: PMID });
    expect(paper).toMatchObject({ status: "blocked", abstract: null, sourceInput: null });
    const short = testContext(clean([["esummary.fcgi", esummary()], ["europepmc", epmc({ abstractText: "Too short." })]]));
    expect((await ingestPaper(short.ctx, { pmid: PMID })).status).toBe("blocked");
  });

  it("treats a failed retraction check as unknown, never as not retracted", async () => {
    const { ctx } = testContext([
      ["esummary.fcgi", esummary()],
      ["europepmc", epmc()],
      ["api.crossref.org", fixture("crossref-work")],
      ["api.openalex.org", new Response("down", { status: 400 })],
      ["api.unpaywall.org", fixture("unpaywall")],
    ]);
    const paper = await ingestPaper(ctx, { pmid: PMID });
    expect(paper).toMatchObject({ status: "blocked", retraction: "unknown" });
    expect(paper.issues.join(" ")).toMatch(/never treated as not retracted/);
  });

  it("blocks a retracted paper even when the receipt services were clean", async () => {
    const { ctx } = testContext(clean([["esummary.fcgi", esummary(DOI, ["Retracted Publication"])], ["europepmc", epmc()]]));
    expect(await ingestPaper(ctx, { pmid: PMID })).toMatchObject({ status: "blocked", retraction: "retracted" });
  });

  it("blocks publication types Spindle does not admit as sources", async () => {
    const { ctx } = testContext(clean([["esummary.fcgi", esummary()], ["europepmc", epmc({ title: "A trial", pubTypeList: { pubType: ["Randomized Controlled Trial"] } })]]));
    expect(await ingestPaper(ctx, { pmid: PMID })).toMatchObject({ status: "blocked", kind: null });
    expect(paperKind(["Practice Guideline"])).toBe("position_stand");
    expect(paperKind(["Systematic Review"])).toBe("systematic_review");
    expect(paperKind(["Review"])).toBeNull();
  });

  it("classifies from PubMed publication types when Europe PMC has no matching record", async () => {
    const cr = fixture<{ message: Record<string, unknown> }>("crossref-work");
    const withAbstract = { ...cr, message: { ...cr.message, abstract: `<jats:p>${ABSTRACT}</jats:p>` } };
    const { ctx } = testContext([
      ["esummary.fcgi", esummary(DOI, ["Meta-Analysis", "Journal Article"])],
      ["europepmc", { hitCount: 0, resultList: { result: [] } }],
      ["api.crossref.org", withAbstract],
      ["api.openalex.org", fixture("openalex-work")],
      ["api.unpaywall.org", fixture("unpaywall")],
    ]);
    const paper = await ingestPaper(ctx, { pmid: PMID });
    expect(paper).toMatchObject({ status: "ready", kind: "meta_analysis", abstract: { origin: "crossref" } });
  });

  it("falls back to the Crossref abstract for a DOI with no matching Europe PMC record", async () => {
    const cr = fixture<{ message: Record<string, unknown> }>("crossref-work");
    const withAbstract = { ...cr, message: { ...cr.message, abstract: `<jats:p>${ABSTRACT}</jats:p>` } };
    const { ctx } = testContext([
      ["europepmc", { hitCount: 0, resultList: { result: [] } }],
      ["api.crossref.org", withAbstract],
      ["api.openalex.org", fixture("openalex-work")],
      ["api.unpaywall.org", fixture("unpaywall")],
    ]);
    const paper = await ingestPaper(ctx, { doi: DOI });
    expect(paper.abstract?.origin).toBe("crossref");
    expect(paper.kind).toBeNull(); // no PubMed publication types: a title is not evidence of design
    expect(paper.status).toBe("blocked");
  });
});

const check = (overrides: Partial<SourceCheck>): SourceCheck => ({
  doi: DOI, checkedAt: "2026-10-11T00:00:00.000Z", status: "verified", exists: true, retracted: false, retractionSources: [],
  oa: { isOa: false }, licenseStatus: "unknown", answered: { crossref: true, openalex: true, unpaywall: true }, issues: [], ...overrides,
});

describe("retraction state and the monthly recheck", () => {
  it("only a verified receipt is not retracted", () => {
    expect(retractionState(check({}))).toBe("not_retracted");
    expect(retractionState(check({ status: "unverified", issues: ["openalex failed"] }))).toBe("unknown");
    expect(retractionState(check({ status: "flagged", retracted: true, retractionSources: ["crossref"] }))).toBe("retracted");
    expect(retractionState(check({}), true)).toBe("retracted");
  });

  it("records retractions, clears verified sources and reports unknowns", () => {
    expect(recheckAction(check({}))).toEqual({ action: "clear" });
    expect(recheckAction(check({ status: "unverified", issues: ["crossref failed: HTTP 503"] }))).toEqual({ action: "unknown", issues: ["crossref failed: HTTP 503"] });
    expect(recheckAction(check({ status: "flagged", retracted: true, retractionSources: ["crossref"] }))).toEqual({
      action: "record", notice: { origin: "crossref", reference: DOI, detectedAt: "2026-10-11T00:00:00.000Z" },
    });
    expect(recheckAction(check({ status: "flagged", retracted: true, retractionSources: ["openalex"] }))).toMatchObject({
      action: "record", notice: { origin: "manual", reference: `openalex reports ${DOI} as retracted` },
    });
  });
});

describe("YouTube oEmbed preflight", () => {
  const ok = { title: "Synthetic clip", author_name: "Synthetic channel", type: "video", provider_name: "YouTube", html: "<iframe>" };

  it("passes only on a valid 200 and fails closed on anything else", async () => {
    const pass = testContext([["youtube.com/oembed", ok]]);
    expect(await checkYouTubeEmbed(pass.ctx, "AbCdEfGhIj0")).toMatchObject({ status: "embeddable", title: "Synthetic clip", channel: "Synthetic channel" });
    expect(decodeURIComponent(pass.calls[0]!.url)).toContain("url=https://www.youtube.com/watch?v=AbCdEfGhIj0");
    const off = testContext([["youtube.com/oembed", new Response("Unauthorized", { status: 401 })]]);
    expect((await checkYouTubeEmbed(off.ctx, "AbCdEfGhIj0")).status).toBe("not_embeddable");
    const gone = testContext([["youtube.com/oembed", new Response("Not Found", { status: 404 })]]);
    expect((await checkYouTubeEmbed(gone.ctx, "AbCdEfGhIj0")).status).toBe("missing");
    const created = testContext([["youtube.com/oembed", new Response(JSON.stringify(ok), { status: 201, headers: { "content-type": "application/json" } })]]);
    expect((await checkYouTubeEmbed(created.ctx, "AbCdEfGhIj0")).status).toBe("error");
    const odd = testContext([["youtube.com/oembed", { title: "x", type: "rich" }]]);
    expect((await checkYouTubeEmbed(odd.ctx, "AbCdEfGhIj0")).status).toBe("error");
    await expect(checkYouTubeEmbed(pass.ctx, "../../x")).rejects.toThrow(/not a YouTube video id/);
  });

  it("spaces YouTube requests", () => {
    expect(DEFAULT_INTERVALS_MS["www.youtube.com"]).toBeGreaterThanOrEqual(500);
  });

  it("disables a clip whose recheck fails", () => {
    expect(embedRecheckActions({ status: "embeddable", title: "x", channel: "y", checkedAt: "t" })).toMatchObject({ outcome: "pass", disable: false });
    expect(embedRecheckActions({ status: "missing", detail: "oEmbed 404", checkedAt: "t" })).toMatchObject({ outcome: "fail", disable: true });
    expect(embedRecheckActions({ status: "error", detail: "timeout", checkedAt: "t" })).toMatchObject({ outcome: "fail", disable: true });
  });
});

describe("metadata refresh (Sol C06)", () => {
  it("stores confirmed unavailability and leaves transient errors alone", () => {
    expect(metadataRefreshAction({ status: "embeddable", title: "t", channel: "c", checkedAt: "x" })).toEqual({ action: "refresh", available: true, title: "t", channel: "c" });
    expect(metadataRefreshAction({ status: "missing", detail: "oEmbed 404", checkedAt: "x" })).toMatchObject({ action: "unavailable", embedOutcome: "fail", available: false });
    expect(metadataRefreshAction({ status: "not_embeddable", detail: "401", checkedAt: "x" })).toMatchObject({ action: "unavailable", available: false });
    expect(metadataRefreshAction({ status: "error", detail: "timeout", checkedAt: "x" })).toEqual({ action: "unknown", detail: "timeout" });
  });
});

describe("pre-publish retraction recheck (Sol C01)", () => {
  const src = (id: string, doi: string | null, kind = "meta_analysis") => ({ id, doi, kind });
  it("publishes only when every DOI source is verified now", () => {
    const ok = prepublishDecision([src("a", DOI)], new Map([["a", check({})]]));
    expect(ok).toEqual({ publish: true, record: [], unknown: [], unverifiable: [] });
  });
  it("records retractions and refuses", () => {
    const d = prepublishDecision([src("a", DOI)], new Map([["a", check({ status: "flagged", retracted: true, retractionSources: ["crossref"] })]]));
    expect(d.publish).toBe(false);
    expect(d.record).toHaveLength(1);
  });
  it("refuses unknown results and papers it cannot check, but lets textbooks and nomenclature through", () => {
    const d = prepublishDecision([src("a", DOI), src("b", null), src("c", null, "textbook"), src("d", null, "nomenclature")],
      new Map([["a", check({ status: "unverified", issues: ["openalex failed"] })]]));
    expect(d).toMatchObject({ publish: false, unknown: [{ sourceId: "a" }], unverifiable: ["b"] });
  });
});

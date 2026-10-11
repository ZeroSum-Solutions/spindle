// Synthetic responses only (abstract text is a placeholder). No network.
import { describe, expect, it } from "vitest";
import { checkYouTubeEmbed, embedRecheckActions } from "./media";
import { ingestPaper, paperKind } from "./ingest";
import { recheckAction, retractionState } from "./retraction";
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
    const odd = testContext([["youtube.com/oembed", { title: "x", type: "rich" }]]);
    expect((await checkYouTubeEmbed(odd.ctx, "AbCdEfGhIj0")).status).toBe("error");
    await expect(checkYouTubeEmbed(pass.ctx, "../../x")).rejects.toThrow(/not a YouTube video id/);
  });

  it("disables a clip whose recheck fails", () => {
    expect(embedRecheckActions({ status: "embeddable", title: "x", channel: "y", checkedAt: "t" })).toMatchObject({ outcome: "pass", disable: false });
    expect(embedRecheckActions({ status: "missing", detail: "oEmbed 404", checkedAt: "t" })).toMatchObject({ outcome: "fail", disable: true });
    expect(embedRecheckActions({ status: "error", detail: "timeout", checkedAt: "t" })).toMatchObject({ outcome: "fail", disable: true });
  });
});

// D-12 source-type overrides and publication metadata in evidence entries. Synthetic responses; no network.
import { describe, expect, it } from "vitest";
import { ingestPaper, overrideRefusal } from "./ingest";
import { buildClaimPacket, evidenceEntrySchema, evidenceMatchesSource, reviewPrompt, type EvidenceEntry, type ReviewPacket } from "./review/index";
import { fixture, testContext } from "./testing";

const DOI = "10.1177/0269215520934147";
const PMID = "32571081";
const ABSTRACT = "SYNTHETIC ABSTRACT FOR TESTS. ".repeat(12);
const WHY = "The society publishes it as its official position stand; PubMed tags it only as a review.";

const epmc = (types: string[], extra: Record<string, unknown> = {}) => ({
  hitCount: 1,
  resultList: { result: [{ id: PMID, pmid: PMID, doi: DOI, title: "Synthetic position stand", pubYear: "2026", journalInfo: { journal: { title: "Synthetic Journal" } },
    abstractText: ABSTRACT, pubTypeList: { pubType: types }, ...extra }] },
});
const esummary = (types: string[], pubdate = "2026 Mar") => ({
  result: { uids: [PMID], [PMID]: { uid: PMID, title: "Synthetic position stand.", pubtype: types, pubdate, articleids: [{ idtype: "doi", value: DOI }] } },
});
let unpaywall: unknown = fixture("unpaywall");
const ctxFor = (types: string[], epmcExtra: Record<string, unknown> = {}, pubdate?: string) =>
  testContext([
    ["esummary.fcgi", esummary(types, pubdate)],
    ["europepmc", epmc(types, epmcExtra)],
    ["api.crossref.org", fixture("crossref-work")],
    ["api.openalex.org", fixture("openalex-work")],
    ["api.unpaywall.org", unpaywall],
  ]).ctx;

describe("D-12 kind override at ingest", () => {
  it("blocks a mislabelled guidance document without an override", async () => {
    const paper = await ingestPaper(ctxFor(["Review", "Journal Article"]), { pmid: PMID });
    expect(paper).toMatchObject({ status: "blocked", kind: null });
  });

  it("makes it a position stand with the override recorded, the types it overrides included", async () => {
    const paper = await ingestPaper(ctxFor(["Review", "Journal Article"]), { pmid: PMID }, { kindOverride: { documentType: "position_stand", justification: WHY } });
    expect(paper).toMatchObject({ status: "ready", kind: "position_stand", year: 2026 });
    expect(paper.sourceInput?.kindOverride).toEqual({ documentType: "position_stand", justification: WHY, publicationTypes: ["Review", "Journal Article"] });
  });

  it.each([
    ["a trial", ["Randomized Controlled Trial", "Journal Article"], /names a study or notice/],
    ["a retraction notice", ["Retraction of Publication"], /names a study or notice/],
    ["a paper PubMed already types", ["Systematic Review"], /no override is needed/],
  ])("refuses an override for %s", async (_n, types, error) => {
    const paper = await ingestPaper(ctxFor(types), { pmid: PMID }, { kindOverride: { documentType: "clinical_guideline", justification: WHY } });
    expect(paper.issues.join(" ")).toMatch(error);
    expect(paper.sourceInput?.kindOverride).toBeUndefined();
    if (types[0] !== "Systematic Review") expect(paper.status).toBe("blocked");
  });

  it("refuses a thin justification", () => {
    expect(overrideRefusal(["Review"], null, { documentType: "care_pathway", justification: "Looks right." })).toMatch(/at least 40/);
  });
});

describe("publication metadata", () => {
  it("blocks a paper with no publication year, since a dated claim could not be checked", async () => {
    const paper = await ingestPaper(ctxFor(["Meta-Analysis"], { pubYear: undefined }, ""), { pmid: PMID });
    expect(paper.status).toBe("blocked");
    expect(paper.issues.join(" ")).toMatch(/no publication year/);
  });

  const entry: EvidenceEntry = {
    sourceId: "11111111-1111-4111-8111-111111111111", kind: "position_stand", title: "Synthetic position stand",
    identifiers: { doi: DOI }, text: ABSTRACT, textOrigin: "europepmc-med", retraction: "not_retracted", checkedAt: "2026-10-11T00:00:00Z",
    year: 2026, journal: "Synthetic Journal",
  };
  const withOverride: EvidenceEntry = { ...entry, kindOverride: { documentType: "position_stand", justification: WHY, publicationTypes: ["Review"] } };

  it("carries year, journal and the override in the evidence entry", () => {
    expect(evidenceEntrySchema.parse(withOverride)).toEqual(withOverride);
    expect(() => evidenceEntrySchema.parse({ ...withOverride, kind: "systematic_review" })).toThrow(/kind override/);
    expect(() => evidenceEntrySchema.parse({ ...entry, year: 3000 })).toThrow();
  });

  it("matches a source only when the evidence shows the database's override", () => {
    const identity = { doi: DOI, pmid: null, kind: "position_stand" };
    expect(evidenceMatchesSource(withOverride, { ...identity, overridden: true })).toBe(true);
    expect(evidenceMatchesSource(entry, { ...identity, overridden: true })).toBe(false);
    expect(evidenceMatchesSource(withOverride, { ...identity, overridden: false })).toBe(false);
  });

  it("tells the reviewer the metadata is from PubMed and to check an override", () => {
    const packet = { version: 1, rubric: "claims", createdAt: "2026-10-11T00:00:00Z", items: [], evidence: [withOverride] } as unknown as ReviewPacket;
    const prompt = reviewPrompt(packet);
    expect(prompt).toMatch(/title, year and journal come from its PubMed record/);
    expect(prompt).toMatch(/kindOverride/);
    expect(prompt).toContain('"year":2026');
  });
});

describe("D-12 open foundation references", () => {
  const ANATOMY = "An open-access anatomy review used for structure and naming only, never for effects.";
  const licensed = (license: string | null) => {
    const u = fixture<Record<string, unknown>>("unpaywall");
    const best = { ...(u.best_oa_location as Record<string, unknown>), license };
    return { ...u, is_oa: license !== null, best_oa_location: license === null ? null : best, oa_locations: license === null ? [] : [best] };
  };

  it("admits an open anatomy review as a foundation reference", async () => {
    unpaywall = licensed("cc-by");
    const paper = await ingestPaper(ctxFor(["Review", "Journal Article"]), { pmid: PMID }, { kindOverride: { documentType: "anatomy_reference", justification: ANATOMY } });
    unpaywall = fixture("unpaywall");
    expect(paper).toMatchObject({ status: "ready", kind: "foundation_reference" });
    expect(paper.sourceInput?.kindOverride?.documentType).toBe("anatomy_reference");
  });

  it("refuses a closed reference", () => {
    expect(overrideRefusal(["Review"], null, { documentType: "anatomy_reference", justification: ANATOMY }, "All rights reserved")).toMatch(/open licence/);
    expect(overrideRefusal(["Review"], null, { documentType: "anatomy_reference", justification: ANATOMY }, null)).toMatch(/open licence/);
    expect(overrideRefusal(["Review"], null, { documentType: "anatomy_reference", justification: ANATOMY }, "cc-by")).toBeNull();
  });

  const ref: EvidenceEntry = {
    sourceId: "22222222-2222-4222-8222-222222222222", kind: "foundation_reference", title: "Synthetic anatomy review",
    identifiers: { doi: DOI }, text: ABSTRACT, textOrigin: "europepmc-med", retraction: "not_retracted", checkedAt: "2026-10-11T00:00:00Z",
    year: 2013, kindOverride: { documentType: "anatomy_reference", justification: ANATOMY, publicationTypes: ["Review"] },
  };

  it("needs the override on a foundation reference entry, matching its kind", () => {
    expect(evidenceEntrySchema.parse(ref)).toEqual(ref);
    expect(() => evidenceEntrySchema.parse({ ...ref, kindOverride: undefined })).toThrow(/needs its kind override/);
    expect(() => evidenceEntrySchema.parse({ ...ref, kind: "position_stand" })).toThrow(/does not match/);
  });

  it("shows the reviewer each claim's domain and the foundation rule", () => {
    const target = { claimId: "33333333-3333-4333-8333-333333333333", hash: "a".repeat(64), statement: "The scapula has no bony joint with the thorax.",
      evidenceLevel: "Open anatomy reference", population: "Adults", sourceIds: [ref.sourceId], status: "unreviewed", domain: "foundation" as const };
    const built = buildClaimPacket([target], new Map([[ref.sourceId, ref]]), "2026-10-11T00:00:00Z",
      new Map([[ref.sourceId, { doi: DOI, pmid: null, kind: "foundation_reference", overridden: true }]]));
    expect(built.packet?.items[0]?.content).toMatchObject({ domain: "foundation" });
    const prompt = reviewPrompt(built.packet!);
    expect(prompt).toMatch(/Reject a foundation claim that asserts an effect, risk, treatment/);
    const applied = buildClaimPacket([{ ...target, domain: undefined }], new Map([[ref.sourceId, ref]]), "2026-10-11T00:00:00Z",
      new Map([[ref.sourceId, { doi: DOI, pmid: null, kind: "foundation_reference", overridden: true }]]));
    expect(applied.packet?.items[0]?.content).toMatchObject({ domain: "applied" });
  });
});


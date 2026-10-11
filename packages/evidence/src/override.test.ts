// D-12 source-type overrides and publication metadata in evidence entries. Synthetic responses; no network.
import { describe, expect, it } from "vitest";
import { ingestPaper, isOpenLicense, NOT_GUIDANCE, overrideRefusal } from "./ingest";
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
  result: { uids: [PMID], [PMID]: { uid: PMID, title: "Synthetic position stand.", pubtype: types, pubdate, fulljournalname: "Synthetic Journal", articleids: [{ idtype: "doi", value: DOI }] } },
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
    expect(evidenceMatchesSource(withOverride, { ...identity, override: withOverride.kindOverride! })).toBe(true);
    expect(evidenceMatchesSource(entry, { ...identity, override: withOverride.kindOverride! })).toBe(false);
    expect(evidenceMatchesSource(withOverride, { ...identity, override: null })).toBe(false);
  });

  it("tells the reviewer the metadata is from PubMed and to check an override", () => {
    const packet = { version: 1, rubric: "claims", createdAt: "2026-10-11T00:00:00Z", items: [], evidence: [withOverride] } as unknown as ReviewPacket;
    const prompt = reviewPrompt(packet);
    expect(prompt).toMatch(/year and journal come from its PubMed record/);
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
    year: 2013, journal: "Synthetic Anatomy Journal", kindOverride: { documentType: "anatomy_reference", justification: ANATOMY, publicationTypes: ["Review"] },
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
      new Map([[ref.sourceId, { doi: DOI, pmid: null, kind: "foundation_reference", override: ref.kindOverride! }]]));
    expect(built.packet?.items[0]?.content).toMatchObject({ domain: "foundation" });
    const prompt = reviewPrompt(built.packet!);
    expect(prompt).toMatch(/reject a foundation claim that asserts an effect, risk, treatment/);
    const applied = buildClaimPacket([{ ...target, domain: undefined }], new Map([[ref.sourceId, ref]]), "2026-10-11T00:00:00Z",
      new Map([[ref.sourceId, { doi: DOI, pmid: null, kind: "foundation_reference", override: ref.kindOverride! }]]));
    expect(applied.packet?.items[0]?.content).toMatchObject({ domain: "applied" });
  });
});

describe("Sol R1 on #26", () => {
  const ANATOMY = "An open-access anatomy review used for structure and naming only, never for effects.";

  it("PR26-01: admits only CC BY, CC0 and public domain, never restricted CC variants", () => {
    for (const ok of ["cc-by", "CC BY 4.0", "CC-BY-4.0", "cc0", "CC0 1.0", "public domain", "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)"]) expect(isOpenLicense(ok)).toBe(true);
    for (const no of ["cc-by-nc-sa", "CC BY-ND 4.0", "CC BY-NC 4.0", "cc-by-sa", "All rights reserved", "", "cc-byx"]) expect(isOpenLicense(no)).toBe(false);
    expect(overrideRefusal(["Review"], null, { documentType: "anatomy_reference", justification: ANATOMY }, "CC BY-NC-SA 4.0")).toMatch(/open licence/);
  });

  it("PR26-02: refuses every study and notice type", () => {
    for (const t of ["Clinical Study", "Multicenter Study", "Validation Study", "Expression of Concern", "Observational Study", "Randomized Controlled Trial", "Case Reports", "Retraction of Publication", "Letter"]) {
      expect(NOT_GUIDANCE.test(t)).toBe(true);
    }
    for (const t of ["Review", "Journal Article", "Practice Guideline", "Consensus Development Conference"]) expect(NOT_GUIDANCE.test(t)).toBe(false);
  });

  it("PR26-02: checks PubMed's types too when Europe PMC lists others", async () => {
    const paper = await ingestPaper(
      testContext([
        ["esummary.fcgi", esummary(["Randomized Controlled Trial", "Journal Article"])],
        ["europepmc", epmc(["Review"])],
        ["api.crossref.org", fixture("crossref-work")],
        ["api.openalex.org", fixture("openalex-work")],
        ["api.unpaywall.org", fixture("unpaywall")],
      ]).ctx,
      { pmid: PMID },
      { kindOverride: { documentType: "clinical_guideline", justification: WHY } },
    );
    expect(paper.status).toBe("blocked");
    expect(paper.issues.join(" ")).toMatch(/Randomized Controlled Trial.*names a study or notice/);
  });

  it("PR26-03: gives guidance and reference overrides separate instructions", () => {
    const prompt = reviewPrompt({ version: 1, rubric: "claims", createdAt: "2026-10-11T00:00:00Z", items: [], evidence: [] } as unknown as ReviewPacket);
    expect(prompt).toMatch(/guidance override \(position_stand, clinical_guideline, consensus_statement, care_pathway\)/);
    expect(prompt).toMatch(/reference override \(anatomy_reference, nomenclature_reference\)/);
    expect(prompt).not.toMatch(/An entry with kindOverride is a document whose type a publisher recorded because PubMed mislabels it: approve/);
  });

  const base: EvidenceEntry = {
    sourceId: "11111111-1111-4111-8111-111111111111", kind: "position_stand", title: "Synthetic position stand",
    identifiers: { doi: DOI }, text: ABSTRACT, textOrigin: "europepmc-med", retraction: "not_retracted", checkedAt: "2026-10-11T00:00:00Z",
    year: 2026, journal: "Synthetic Journal",
  };
  const ov = { documentType: "position_stand" as const, justification: WHY, publicationTypes: ["Review"] };

  it("PR26-04: matches the recorded override's fields, not only its presence", () => {
    const identity = { doi: DOI, pmid: null, kind: "position_stand", override: ov };
    expect(evidenceMatchesSource({ ...base, kindOverride: ov }, identity)).toBe(true);
    expect(evidenceMatchesSource({ ...base, kindOverride: { ...ov, justification: `${WHY} Edited.` } }, identity)).toBe(false);
    expect(evidenceMatchesSource({ ...base, kindOverride: { ...ov, publicationTypes: ["Journal Article"] } }, identity)).toBe(false);
    expect(evidenceMatchesSource({ ...base, kindOverride: ov }, { ...identity, override: null })).toBe(false);
    expect(evidenceMatchesSource(base, { ...identity, override: null })).toBe(true);
  });

  it("PR26-05: paper evidence needs its year and journal at the packet boundary; references and nomenclature do not", () => {
    expect(() => evidenceEntrySchema.parse({ ...base, year: undefined })).toThrow(/year and journal/);
    expect(() => evidenceEntrySchema.parse({ ...base, journal: undefined, kind: "meta_analysis" })).toThrow(/year and journal/);
    expect(() => evidenceEntrySchema.parse({ ...base, kind: "textbook", year: undefined, journal: undefined })).not.toThrow();
  });

  it("PR26-07: takes year and journal only from a PubMed or Europe PMC MED record", async () => {
    const run = (source: string) =>
      ingestPaper(
        testContext([
          ["europepmc", epmc(["Meta-Analysis"], { source })],
          ["api.crossref.org", fixture("crossref-work")],
          ["api.openalex.org", fixture("openalex-work")],
          ["api.unpaywall.org", fixture("unpaywall")],
        ]).ctx,
        { doi: DOI },
      );
    expect(await run("MED")).toMatchObject({ year: 2026, journal: "Synthetic Journal" });
    const ppr = await run("PPR");
    expect(ppr.year).toBeUndefined();
    expect(ppr.status).toBe("blocked");
  });

  it("PR26-01 R2: validates the whole licence value; only a matching CC licence URL may follow", () => {
    for (const no of ["CC BY (NC-SA)", "CC BY 4.0; non-commercial use only", "CC BY 4.0, no derivatives", "CC BY 4.0 (https://creativecommons.org/licenses/by-nc/4.0/)",
      "CC0 (https://creativecommons.org/licenses/by/4.0/)", "CC BY 4.0 (see terms)"]) expect(isOpenLicense(no)).toBe(false);
    for (const ok of ["CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)", "CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/)", "cc by"]) expect(isOpenLicense(ok)).toBe(true);
  });

  it("PR26-R2-01: asks Sol to check that a reference override reads as that kind of reference", () => {
    const prompt = reviewPrompt({ version: 1, rubric: "claims", createdAt: "2026-10-11T00:00:00Z", items: [], evidence: [] } as unknown as ReviewPacket);
    expect(prompt).toMatch(/only if its text itself reads as an anatomy or nomenclature reference/);
  });
});


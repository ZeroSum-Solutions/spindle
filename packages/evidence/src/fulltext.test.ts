// D-13 full-text sections and publisher excerpts. Synthetic JATS and text only; no network.
import { describe, expect, it } from "vitest";
import { getEuropePmcFullText, jatsSections, MAX_SECTION_CHARS, publisherExcerpt, selectSections, type Excerpt } from "./fulltext";
import { evidenceEntrySchema, reviewPrompt, type EvidenceEntry, type ReviewPacket } from "./review/index";
import { testContext } from "./testing";

const JATS = `<?xml version="1.0"?><!DOCTYPE article PUBLIC "-//NLM//DTD JATS//EN" "x.dtd">
<article><front><article-meta><abstract><p>Abstract text is not a section.</p></abstract></article-meta></front>
<body>
<sec id="s1"><title>1. Anatomy</title><p>The scapula is a flat bone &amp; rests on the thorax (p &lt; 0.05).</p>
  <fig id="f1"><label>Figure 1</label><caption><p>Figure caption is skipped.</p></caption></fig>
  <sec id="s1a"><title>1.1 Muscles</title><p>Serratus anterior attaches to the <italic>medial</italic> border.</p>
    <table-wrap><table><tr><td>table text skipped</td></tr></table></table-wrap></sec>
  <p>After the subsection.<![CDATA[ x<y ]]></p></sec>
<sec id="s2"><title>2. Treatment</title><p>Not anatomy.</p></sec>
</body><back><ref-list><ref><p>Reference text.</p></ref></ref-list></back></article>`;

describe("jatsSections", () => {
  it("returns body sections with their own prose and a title path, skipping figures, tables, front and back", () => {
    expect(jatsSections(JATS)).toEqual([
      { locator: "Section: 1. Anatomy > 1.1 Muscles", text: "Serratus anterior attaches to the medial border." },
      { locator: "Section: 1. Anatomy", text: "The scapula is a flat bone & rests on the thorax (p < 0.05). After the subsection. x<y" },
      { locator: "Section: 2. Treatment", text: "Not anatomy." },
    ]);
  });
});

describe("selectSections", () => {
  const sections = jatsSections(JATS);
  it("picks the named sections under an open licence", () => {
    const picked = selectSections(sections, ["anatomy"], "cc-by");
    expect(picked.map((p) => p.locator)).toEqual(["Section: 1. Anatomy > 1.1 Muscles", "Section: 1. Anatomy"]);
    expect(picked.every((p) => p.origin === "europepmc-fulltext" && p.license === "cc-by")).toBe(true);
  });
  it.each([
    ["a closed licence", ["anatomy"], "All rights reserved", /needs an open licence/],
    ["a restricted CC licence", ["anatomy"], "cc-by-nc", /needs an open licence/],
    ["an unknown section", ["methods"], "cc-by", /no section matches "methods"/],
    ["no section", [], "cc-by", /at least one section/],
  ])("refuses %s", (_n, wanted, license, error) => {
    expect(() => selectSections(sections, wanted as string[], license as string)).toThrow(error as RegExp);
  });
  it("refuses an oversize section", () => {
    expect(() => selectSections([{ locator: "Section: Huge", text: "x".repeat(MAX_SECTION_CHARS + 1) }], ["huge"], "cc0")).toThrow(/name a subsection/);
  });
});

describe("publisherExcerpt", () => {
  const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
  it("adds an attributed excerpt with a locator, up to 300 words per source", () => {
    const first = publisherExcerpt([], words(200), "p. 4, PICO 6", "Synthetic pathway, 2025.");
    expect(first).toMatchObject({ origin: "publisher-excerpt", locator: "p. 4, PICO 6", attribution: "Synthetic pathway, 2025." });
    expect(() => publisherExcerpt([first], words(101), "p. 5", "Synthetic pathway, 2025.")).toThrow(/301 words; the limit is 300/);
    expect(() => publisherExcerpt([first], words(100), "p. 5", "Synthetic pathway, 2025.")).not.toThrow();
  });
  it("needs a locator and an attribution", () => {
    expect(() => publisherExcerpt([], "text", " ", "a")).toThrow(/locator/);
    expect(() => publisherExcerpt([], "text", "p. 1", "")).toThrow(/attribution/);
  });
});

describe("excerpts at the packet boundary", () => {
  const entry: EvidenceEntry = {
    sourceId: "11111111-1111-4111-8111-111111111111", kind: "position_stand", title: "Synthetic pathway", identifiers: { doi: "10.5555/x" },
    text: "Synthetic abstract.", textOrigin: "europepmc-med", retraction: "not_retracted", checkedAt: "2026-10-11T00:00:00Z", year: 2025, journal: "Synthetic Journal",
  };
  const excerpt = (x: Partial<Excerpt>): Excerpt => ({ origin: "publisher-excerpt", locator: "p. 4", text: "Synthetic words.", attribution: "Synthetic, 2025.", ...x });
  it("accepts attributed excerpts and open full text", () => {
    expect(() => evidenceEntrySchema.parse({ ...entry, excerpts: [excerpt({}), excerpt({ origin: "europepmc-fulltext", license: "CC BY 4.0", attribution: undefined })] })).not.toThrow();
  });
  it.each([
    ["full text under a closed licence", [excerpt({ origin: "europepmc-fulltext", license: "All rights reserved", attribution: undefined })], /open licence/],
    ["an unattributed publisher excerpt", [excerpt({ attribution: undefined })], /attribution/],
    ["more than 300 words of publisher excerpts", [excerpt({ text: "w ".repeat(200) }), excerpt({ text: "w ".repeat(101) })], /300 words/],
  ])("refuses %s", (_n, excerpts, error) => {
    expect(() => evidenceEntrySchema.parse({ ...entry, excerpts })).toThrow(error);
  });
  it("tells Sol to say when an excerpt is too short", () => {
    const prompt = reviewPrompt({ version: 1, rubric: "claims", createdAt: "2026-10-11T00:00:00Z", items: [], evidence: [] } as unknown as ReviewPacket);
    expect(prompt).toMatch(/say in a BLOCK finding\s+that the excerpt is insufficient/);
  });
});

describe("getEuropePmcFullText", () => {
  it("fetches the JATS text for a PMCID and maps 404 to null", async () => {
    const ok = testContext([["PMC123/fullTextXML", () => new Response(JATS, { status: 200 })]]);
    expect(await getEuropePmcFullText(ok.ctx, "PMC123")).toBe(JATS);
    expect(ok.calls[0]!.headers.Accept).toMatch(/xml/);
    const missing = testContext([["PMC9/fullTextXML", () => new Response("", { status: 404 })]]);
    expect(await getEuropePmcFullText(missing.ctx, "PMC9")).toBeNull();
    await expect(getEuropePmcFullText(ok.ctx, "../x")).rejects.toThrow(/PMCID/);
  });
});

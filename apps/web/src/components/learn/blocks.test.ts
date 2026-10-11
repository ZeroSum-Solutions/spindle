import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ClaimIntegrityState, LessonBlock } from "@spindle/schema";
import type { ClaimView } from "../../lib/learning/load";
import { LessonBlocks } from "./blocks";

const claim = (id: string, statement: string): ClaimView => ({
  id,
  statement,
  evidenceLevel: "Synthetic: systematic review",
  population: "Synthetic: adults",
  sources: [{ id: `s-${id}`, kind: "systematic_review", title: `Synthetic source ${id}`, doi: `10.0000/${id}`, pmid: null, url: null, locator: null, license: "Synthetic", retractedAt: null }],
});
const C1 = "00000000-0000-4000-8000-0000000000c1";
const C2 = "00000000-0000-4000-8000-0000000000c2";

// Both synthetic claims are current unless a test says otherwise.
const CURRENT = new Map<string, ClaimIntegrityState>([[C1, "current"], [C2, "current"]]);

function render(blocks: LessonBlock[], flagged: string[] = [], integrity: ReadonlyMap<string, ClaimIntegrityState> | null = CURRENT) {
  const claims = new Map([[C1, claim(C1, "Synthetic claim one.")], [C2, claim(C2, "Synthetic claim two.")]]);
  return renderToStaticMarkup(createElement(LessonBlocks, { blocks, ctx: { orgId: null, claims, flagged: new Set(flagged), integrity } }));
}

describe("diagram blocks", () => {
  it.each(["toString", "constructor", "hasOwnProperty", "__proto__", "valueOf", "synthetic-unknown"])("an id with no drawing (%s) renders the unavailable state", (diagramId) => {
    const html = render([{ kind: "diagram", content: { diagramId, caption: "Synthetic caption" } }]);
    expect(html).toContain("This diagram is not available yet.");
    expect(html).not.toContain('data-diagram="available"');
  });

  it("an id with a drawing renders it", () => {
    expect(render([{ kind: "diagram", content: { diagramId: "shoulder-complex-front", caption: "" } }])).toContain('data-diagram="available"');
  });
});

describe("a run of science blocks", () => {
  const blocks: LessonBlock[] = [
    { kind: "paragraph", content: "Synthetic science one.", support: "science", claimIds: [C1] },
    { kind: "paragraph", content: "Synthetic science two.", support: "science", claimIds: [C2] },
  ];

  it("shows one label but keeps every block's own sources and its retraction marker", () => {
    const html = render(blocks, [C2]);
    const sections = html.split('<section data-block="paragraph" data-support="science"').slice(1);
    expect(sections).toHaveLength(2);
    expect(html.match(/>Science</g)).toHaveLength(1);
    // Each block keeps its own disclosure, reachable on its own.
    expect(sections[0]).toMatch(/<details[\s\S]*Show sources[\s\S]*Synthetic claim one\./);
    expect(sections[1]).toMatch(/<details[\s\S]*Show sources[\s\S]*Synthetic claim two\./);
    expect(sections[0]).not.toContain("Synthetic claim two.");
    // The retraction marker shows on the second block even though its label is merged away.
    expect(sections[0]).not.toContain("Source retracted");
    expect(sections[1]).toContain("Source retracted");
  });
});

describe("a withdrawn claim inside a science run", () => {
  const C3 = "00000000-0000-4000-8000-0000000000c3";
  const blocks: LessonBlock[] = [
    { kind: "paragraph", content: "Synthetic science one.", support: "science", claimIds: [C1] },
    { kind: "paragraph", content: "Synthetic withdrawn.", support: "science", claimIds: [C2] },
    { kind: "paragraph", content: "Synthetic science three.", support: "science", claimIds: [C3] },
  ];
  const integrity = new Map<string, ClaimIntegrityState>([[C1, "current"], [C2, "withdrawn"], [C3, "recheck_due"]]);

  it("splits the run: the withdrawn block loses the Science label and the next block is labelled again", () => {
    const html = render(blocks, [], integrity);
    const sections = html.split("<section ").slice(1);
    expect(sections).toHaveLength(3);
    expect(sections[0]).toContain(">Science<");
    expect(sections[1]).toContain('data-evidence="withdrawn"');
    expect(sections[1]).toContain("Claim withdrawn");
    expect(sections[1]).not.toContain(">Science<");
    expect(sections[1]).toContain("lg:border-control");
    expect(sections[2]).toContain(">Science<");
    expect(sections[2]).toContain("Evidence due for recheck");
  });
});

describe("an unreadable integrity report", () => {
  const blocks: LessonBlock[] = [
    { kind: "paragraph", content: "Synthetic science one.", support: "science", claimIds: [C1] },
    { kind: "paragraph", content: "Synthetic science two.", support: "science", claimIds: [C2] },
  ];

  it("withholds the Science label but keeps the text and its citations, without claiming withdrawal", () => {
    const html = render(blocks, [], null);
    expect(html).not.toContain(">Science<");
    expect(html).not.toContain("Claim withdrawn");
    expect(html.match(/Evidence status unavailable/g)).toHaveLength(2);
    expect(html).toContain('data-evidence="unknown"');
    expect(html).toContain("Synthetic science one.");
    expect(html).toMatch(/Show sources[\s\S]*Synthetic claim one\./);
  });
});

describe("practice runs and the integrity report", () => {
  // The player e2e lesson: a science paragraph, a practice run of three, an image and a diagram
  // (which end runs), then a science question and a practice question.
  const blocks: LessonBlock[] = [
    { kind: "heading", content: "Synthetic heading" },
    { kind: "paragraph", content: "Synthetic science.", support: "science", claimIds: [C1] },
    { kind: "paragraph", content: "Synthetic practice.", support: "practice-based", claimIds: [] },
    { kind: "callout", content: { label: "Synthetic note", text: "Synthetic callout." }, support: "practice-based", claimIds: [] },
    { kind: "checklist", content: ["Synthetic one", "Synthetic two"], support: "practice-based", claimIds: [] },
    { kind: "image", content: { kind: "image", src: "/media/content/synthetic/absent.png", alt: "Synthetic alt", caption: "", provenanceId: "synthetic" } },
    { kind: "diagram", content: { diagramId: "synthetic-diagram", caption: "" } },
    { kind: "quiz", content: { prompt: "Synthetic?", options: ["A", "B"], answerIndex: 1, explanation: "Synthetic." }, support: "science", claimIds: [C1] },
    { kind: "quiz", content: { prompt: "Synthetic practice?", options: ["A", "B"], answerIndex: 1, explanation: "Synthetic." }, support: "practice-based", claimIds: [] },
  ];
  const labels = (html: string) =>
    html
      .split("<section ")
      .slice(1)
      .map((s) => {
        const body = s.split("</section>")[0]!;
        return body.includes(">Practice-based<") ? "P" : body.includes(">Science<") ? "S" : "-";
      });

  it.each([
    ["present", CURRENT, ["S", "P", "-", "-", "S", "P"]],
    ["unreadable", null, ["-", "P", "-", "-", "-", "P"]],
  ] as const)("integrity %s: one label per practice run; only science blocks change", (_, integrity, expected) => {
    expect(labels(render(blocks, [], integrity))).toEqual(expected);
  });
});

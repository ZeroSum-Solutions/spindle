import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LessonBlock } from "@spindle/schema";
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

function render(blocks: LessonBlock[], flagged: string[] = []) {
  const claims = new Map([[C1, claim(C1, "Synthetic claim one.")], [C2, claim(C2, "Synthetic claim two.")]]);
  return renderToStaticMarkup(createElement(LessonBlocks, { blocks, ctx: { orgId: null, claims, flagged: new Set(flagged) } }));
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

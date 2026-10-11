import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MOTION, PALETTE, TYPE_SCALE } from "../../lib/theme/foundations";
import { FoundationsBoard } from "./foundations-board";

describe("the /design foundations board", () => {
  const html = renderToStaticMarkup(createElement(FoundationsBoard));

  it("shows every palette token, every type step and every motion token", () => {
    for (const c of PALETTE) expect(html).toContain(`data-swatch="${c.token}"`);
    for (const t of TYPE_SCALE) expect(html).toContain(`data-type-step="${t.token}"`);
    for (const m of MOTION) expect(html).toContain(`data-motion-bar="${m.token}"`);
  });

  it("shows the Pressroom wordmark and the favicon sizes", () => {
    expect(html).toContain("/brand/spindle-wordmark-ink.svg");
    expect(html).toContain("/brand/spindle-wordmark-white.svg");
    expect(html).toContain('alt="Spindle symbol at 16px"');
    expect(html).toContain('alt="Spindle symbol at 180px"');
  });

  it("prints checked contrast ratios, none below its minimum", () => {
    const rows = [...html.matchAll(/(\d+\.\d\d):1<\/td><td[^>]*>(\d(?:\.5)?):1/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(rows.length).toBeGreaterThan(5);
    for (const [ratio, min] of rows) expect(ratio).toBeGreaterThanOrEqual(min!);
  });
});

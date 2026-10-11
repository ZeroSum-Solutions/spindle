import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CHECKED_PAIRS, PALETTE, TYPE_SCALE } from "../../lib/theme/foundations";
import { ColourBoard, LogoBoard, MeasurementSpecimen, StopReferSpecimen, TypeBoard } from "./foundations-board";
import { KIT_PARTS, ThemePair } from "./kit";

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe("the /design living kit", () => {
  it("is organised as the eleven numbered parts, Direction to Checks", () => {
    expect(KIT_PARTS.map(([, label]) => label)).toEqual(["Direction", "Logo", "Colour", "Type", "Tokens", "Components", "Screens", "Motion", "Brand in use", "Progress", "Checks"]);
  });

  it("pins each theme pane to its colour scheme", () => {
    const out = html(createElement(ThemePair, null, "x"));
    expect(out).toMatch(/data-theme-pane="light" class="theme-scope theme-scope-light /);
    expect(out).toMatch(/data-theme-pane="dark" class="theme-scope theme-scope-dark /);
  });

  it("shows every palette token and every type step, in both themes", () => {
    const colour = html(createElement(ColourBoard));
    for (const c of PALETTE) {
      expect(colour.match(new RegExp(`data-swatch="${c.token}"`, "g"))).toHaveLength(2);
      expect(colour).toContain(c.light.toUpperCase());
      expect(colour).toContain(c.dark.toUpperCase());
    }
    const type = html(createElement(TypeBoard));
    for (const t of TYPE_SCALE) expect(type).toContain(`data-type-step="${t.token}"`);
  });

  it("prints every checked pair in both themes, none below its minimum", () => {
    const colour = html(createElement(ColourBoard));
    const rows = [...colour.matchAll(/(\d+\.\d\d):1<\/td><td[^>]*>(\d(?:\.5)?):1/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(rows).toHaveLength(CHECKED_PAIRS.length * 2);
    for (const [ratio, min] of rows) expect(ratio).toBeGreaterThanOrEqual(min!);
  });

  it("draws the Lab wordmark inline and shows the favicon sizes", () => {
    const logo = html(createElement(LogoBoard));
    expect(logo).toContain('aria-label="Spindle wordmark, 24px tall"');
    expect(logo).toContain('alt="Spindle symbol at 16px"');
    expect(logo).toContain('alt="Spindle symbol at 180px"');
    expect(logo).toContain("/brand/spindle-symbol-small.svg");
  });

  it("keeps stop and refer free of motion classes", () => {
    const stop = html(createElement(StopReferSpecimen));
    expect(stop).toContain("bg-stop-panel");
    expect(stop).toContain("bg-stop");
    expect(stop).not.toMatch(/animate|transition|logo-reveal|confirm-appear/);
  });

  it("shows a completed track as total / total, never one past the end (Sol R2 on #51)", () => {
    const done = html(createElement(MeasurementSpecimen, { done: 8, total: 8 }));
    expect(done).toContain("08 / 08");
    expect(done).toContain('aria-label="All 8 lessons done"');
    expect(done).toContain("100%");
    expect(done).not.toContain("measure-current");
    const mid = html(createElement(MeasurementSpecimen, { done: 2, total: 8 }));
    expect(mid).toContain("03 / 08");
    expect(mid).toContain('aria-label="Lesson 3 of 8; 2 done"');
  });
});

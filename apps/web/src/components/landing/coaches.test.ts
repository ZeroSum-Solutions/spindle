import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SPINDLE } from "../../lib/brand";
import { LIGHT_SAGE, OXBLOOD, SAGE } from "../../lib/theme/preview-brands";
import { CAPABILITIES, COACH_MODALITIES, Coaches, exampleSwatches } from "./coaches";
import { copyProblems } from "./honesty";

const html = renderToStaticMarkup(createElement(Coaches, { brand: SPINDLE, swatches: exampleSwatches([OXBLOOD, SAGE], () => ({ className: "", family: "inherit" })) }));
const text = html.replace(/<[^>]+>/g, " ");

describe("Coaches page", () => {
  it("marks every future capability and every modality as Planned, in words", () => {
    const items = html.split("data-capability").slice(1);
    expect(items).toHaveLength(CAPABILITIES.length);
    for (const item of items) expect(item.split("</li>")[0]).toContain(">Planned<");
    const modalities = html.split("data-modality").slice(1);
    expect(modalities).toHaveLength(10);
    expect(COACH_MODALITIES.map((m) => m.name)).toEqual(["Strength", "Speed", "Hypertrophy", "Mobility", "Yoga", "Pilates", "Running", "Combat sports", "Team sport", "Youth development"]);
    for (const m of modalities) expect(m.split("</li>")[0]).toContain(">Planned<");
  });

  it("makes no claims it cannot show: the guard finds nothing in the page's main content", () => {
    const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
    expect(copyProblems(main)).toEqual([]);
    expect(text).toContain("made-up example brands");
  });

  it.each([
    "Reviewed by a licensed PT before every release.",
    "13 gyms use Spindle every week.",
    "Gyms trust Spindle.",
    "Eric Cressey recommends Spindle for arm care.",
    "“It changed how my trainers learn,” says a coach.",
    "Course authoring is coming soon.",
    "Launching in spring 2027.",
    "Results guaranteed.",
    "Trusted by strength coaches.",
    "greg nuckols recommends Spindle.",
  ])("the guard rejects forbidden copy: %s", (copy) => {
    expect(copyProblems(`<main><p>${copy}</p></main>`)).not.toEqual([]);
  });

  it("a number-exempt element is still checked for forbidden wording", () => {
    expect(copyProblems("<main><figcaption data-allow-number>13 of 13 checks pass. Reviewed by a licensed PT.</figcaption></main>")).not.toEqual([]);
    expect(copyProblems("<main><span data-allow-number>01 Eric Cressey recommends it</span></main>")).not.toEqual([]);
  });

  it("the guard allows numbers only where they are marked", () => {
    expect(copyProblems('<main><span data-allow-number>01</span><p>Plain words.</p></main>')).toEqual([]);
    expect(copyProblems("<main><p>Plain words, 12 times.</p></main>")).not.toEqual([]);
  });

  it("builds the swatches through the real validator and leaves out a refused theme", () => {
    const font = () => ({ className: "", family: "inherit" });
    const built = exampleSwatches([OXBLOOD, LIGHT_SAGE, SAGE], font);
    expect(built.map((s) => s.brand.name)).toEqual([OXBLOOD.name, SAGE.name]);
    expect(built.every((s) => s.checks.length > 0 && s.checks.every((c) => c.pass))).toBe(true);
    expect(html.match(/data-theme-swatch=/g)).toHaveLength(2);
    expect(text).toMatch(/\b(\d+) of \1 contrast checks pass WCAG 2\.2 AA/);
    expect(text).toContain("Base curriculum by Spindle, cited");
  });

  it("offers the sign-in action and labels the method layer practice-based", () => {
    expect(html).toContain('href="/sign-in?next=%2Fgyms"');
    expect(text).toContain("Practice-based");
    expect(text).toContain("Teach your method on a base that cites its science.");
  });
});

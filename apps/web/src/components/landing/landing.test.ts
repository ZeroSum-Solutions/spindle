import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SPINDLE, type Brand } from "../../lib/brand";
import { Landing } from "./landing";

const render = (brand: Brand) => renderToStaticMarkup(createElement(Landing, { brand }));

describe("Landing", () => {
  it("renders an alternate brand everywhere the brand appears, with its own wordmark proportions", () => {
    const acme: Brand = { name: "Acme Strength", wordmark: { onLight: "/acme/ink.svg", onDark: "/acme/white.svg", width: 160, height: 64 } };
    const html = render(acme);
    expect(html).toContain("Acme Strength teaches personal trainers");
    expect(html).toContain("Acme Strength never diagnoses.");
    expect(html).toContain('aria-label="Acme Strength, home"');
    expect(html).not.toContain("Spindle");
    for (const src of ["/acme/ink.svg", "/acme/white.svg"]) {
      const img = html.match(new RegExp(`<img[^>]*src="${src}"[^>]*>`))?.[0] ?? "";
      expect(img).toContain('width="160"');
      expect(img).toContain('height="64"');
      expect(img).toContain("height:auto");
      expect(img).toContain("aspect-ratio:160 / 64");
      expect(img).not.toMatch(/h-\[33px\]|w-\[120px\]/);
    }
  });

  it("says authoring is planned and describes layers as separate courses", () => {
    const html = render(SPINDLE);
    expect(html).toContain("Authoring planned");
    expect(html).toContain("separate courses");
    expect(html).not.toContain("A trainer sees one course");
  });

  it("keeps the cut motif on section heads, lists modalities only, and stacks the layers top to bottom", () => {
    const html = render(SPINDLE);
    expect(html).not.toContain("Conjugate");
    expect(html).not.toMatch(/<p class="text-label font-medium text-brand">/);
    expect(html.match(/class="cut-tick/g)?.length).toBeGreaterThanOrEqual(4);
    expect([...html.matchAll(/data-layer="(\w+)"/g)].map((m) => m[1])).toEqual(["method", "modality", "base"]);
    expect(html).toContain("In development");
  });

  it("opens on the Lab hero: decorative art per theme, one signal action, the measurement layer", () => {
    const html = render(SPINDLE);
    for (const t of ["light", "dark"]) {
      expect(html).toContain(`/art/track-${t}.webp`);
      expect(html).toContain(`/art/track-${t}-m.webp`);
    }
    expect(html).toMatch(/<img src="\/art\/track-dark\.webp" alt=""/);
    const hero = html.slice(html.indexOf("data-lab-hero"), html.indexOf("</section>", html.indexOf("data-lab-hero")));
    expect(hero.match(/bg-signal /g)).toHaveLength(1);
    expect(hero).toContain("measure-ticks");
  });

  it("closes on the canvas over the chalk art, with the default signal focus ring", () => {
    const html = render(SPINDLE);
    expect(html).toMatch(/<section aria-labelledby="closing-title" class="relative isolate overflow-hidden bg-canvas">/);
    expect(html).toContain("/art/chalk-light.webp");
    expect(html).not.toMatch(/closing-title[^>]*--focus-ring/);
  });
});

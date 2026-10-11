import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SPINDLE, type Brand } from "../../lib/brand";
import { Landing } from "./landing";

const render = (brand: Brand) => renderToStaticMarkup(createElement(Landing, { brand }));

describe("Landing", () => {
  it("renders an alternate brand everywhere the brand appears, with its own wordmark proportions", () => {
    const acme: Brand = { name: "Acme Strength", wordmark: { onLight: "/acme/ink.svg", onInk: "/acme/white.svg", width: 160, height: 64 } };
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

  it("gives the action on the dark section a light focus outline", () => {
    // The global ring is unlayered CSS, so a utility class cannot recolour it; the section sets the ring's custom property.
    expect(render(SPINDLE)).toMatch(/<section aria-labelledby="closing-title" class="[^"]*\[--focus-ring:var\(--color-white\)\]/);
  });
});

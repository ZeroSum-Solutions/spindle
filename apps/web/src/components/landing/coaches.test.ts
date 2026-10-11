import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SPINDLE } from "../../lib/brand";
import { LIGHT_SAGE, OXBLOOD, SAGE } from "../../lib/theme/preview-brands";
import { validateTheme } from "../../lib/theme/tenant-theme";
import { CAPABILITIES, COACH_MODALITIES, Coaches, type ThemeSwatch } from "./coaches";

const swatch = (b: unknown): ThemeSwatch[] => {
  const r = validateTheme(b);
  return r.ok ? [{ theme: r.theme, checks: r.checks, font: { className: "", family: "inherit" } }] : [];
};
const html = renderToStaticMarkup(createElement(Coaches, { brand: SPINDLE, swatches: [...swatch(OXBLOOD), ...swatch(SAGE)] }));
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

  it("makes no claims it cannot show: no statistics, testimonials, dates or launch promises", () => {
    // Digits only appear as list numbering, the WCAG version, the 6-digit code, hex colours and check counts.
    // The footer's licence versions (AGPL-3.0, CC BY-SA 4.0) are shared with the landing page.
    const body = html.slice(0, html.indexOf("<footer")).replace(/<[^>]+>/g, " ");
    const digits = body.match(/\b\d[\d,.%]*\b/g) ?? [];
    for (const d of digits) expect(["01", "02", "03", "04", "05", "2.2", "6", "12", "13"]).toContain(d);
    expect(text).not.toMatch(/testimonial|trusted by|\bcoming soon\b|\b20\d\d\b|guarantee/i);
    // Example brands are labelled as made up; no real gym or coach name appears.
    expect(text).toContain("made-up example brands");
  });

  it("renders each swatch from the validator, with its real pass count, and never a refused theme", () => {
    expect(html.match(/data-theme-swatch=/g)).toHaveLength(2);
    expect(text).toMatch(/13 of 13 contrast checks pass WCAG 2\.2 AA/);
    expect(swatch(LIGHT_SAGE)).toHaveLength(0);
    expect(text).toContain("Base curriculum by Spindle, cited");
  });

  it("offers the sign-in action and labels the method layer practice-based", () => {
    expect(html).toContain('href="/sign-in?next=%2Fgyms"');
    expect(text).toContain("Practice-based");
    expect(text).toContain("Teach your method on a base that cites its science.");
  });
});

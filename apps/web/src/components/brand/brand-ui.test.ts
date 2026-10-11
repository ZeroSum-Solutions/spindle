import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BASE_ATTRIBUTION } from "@spindle/engine";
import { BaseSeal } from "./base-seal";
import { BrandHeader } from "./brand-header";
import { CatalogHero } from "./catalog-hero";
import { CoachNote } from "./coach-note";
import { CourseCard } from "./course-card";
import { CourseCover } from "./course-cover";
import { ModalityChip } from "./modality-chip";
import { bandTokens, COVER_PATTERNS, NEUTRAL_COVER, TENANT_TEXT_FALLBACKS, type CourseCardView, type MemberBrandView } from "./view";

const html = (el: ReactElement) => renderToStaticMarkup(el);
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const decode = (s: string) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

const DARK = bandTokens("#17232b")!;
const COLORS = { accent: "#7a1b26", onAccent: "#ffffff", accentSoft: "#f2e8e9", ...DARK };
const BRAND: MemberBrandView = { name: "Example Strength Club", font: "barlow-condensed", colors: COLORS };
const PENDING: MemberBrandView = { ...BRAND, name: null };
const FONT = "var(--font-tenant-barlow)";

const course = (over: Partial<CourseCardView>): CourseCardView => ({
  id: "c1",
  href: "#c1",
  layer: "method",
  title: "Squat pattern coaching",
  blurb: "How we teach the squat on our floor.",
  tags: ["strength"],
  meta: "6 lessons",
  cover: { pattern: "diagonal", background: "#17232b", foreground: "#ffffff" },
  ...over,
});

describe("band tokens (DESIGN.md › Colors)", () => {
  it("picks the higher of ink and white, and mixes tint and edge from it", () => {
    expect(bandTokens("#ffffff")).toEqual({ band: "#ffffff", onBand: "#17232b", bandTint: "#e3e5e6", bandEdge: "#d1d3d5" });
    expect(bandTokens("#17232b")?.onBand).toBe("#ffffff");
    expect(bandTokens("#e8efe6")?.onBand).toBe("#17232b");
  });

  it("refuses a band where neither ink nor white reaches 4.5:1", () => {
    expect(bandTokens("#777777")).toBeNull();
  });
});

describe("BrandHeader", () => {
  it("shows the admitted name in the brand font on the band, with at most two underlined links, and is not sticky", () => {
    const out = html(createElement(BrandHeader, { brand: BRAND, fontFamily: FONT, links: [{ label: "Courses", href: "#a" }, { label: "About", href: "#b" }, { label: "Extra", href: "#c" }] }));
    expect(out).toMatch(/^<header/);
    expect(text(out)).toContain("Example Strength Club");
    expect(out).toContain(FONT);
    expect(out).toContain("bg-band");
    expect(out.match(/<a /g)).toHaveLength(2);
    expect(text(out)).not.toContain("Extra");
    expect(out).toMatch(/<a [^>]*class="[^"]*underline/);
    expect(out).not.toMatch(/sticky|fixed/);
  });

  it("shows the fixed fallback while the name is pending", () => {
    expect(text(html(createElement(BrandHeader, { brand: PENDING, fontFamily: FONT })))).toContain(TENANT_TEXT_FALLBACKS.brandName);
  });

  it("lets a 60-character unbroken name wrap anywhere", () => {
    expect(html(createElement(BrandHeader, { brand: { ...BRAND, name: "W".repeat(60) }, fontFamily: FONT }))).toContain("overflow-wrap:anywhere");
  });
});

describe("CatalogHero", () => {
  const hero = { headline: "Lift well. Coach better.", tagline: "Our method for teaching the barbell.", modalities: ["strength", "youth"] as const };
  const action = { label: "Start your first course", href: "#start" };

  it("shows the headline in the brand font, the tagline, the chips, and the ink action below the band", () => {
    const out = html(createElement(CatalogHero, { brand: BRAND, hero, fontFamily: FONT, action }));
    const t = text(out);
    expect(t).toContain("Lift well. Coach better.");
    expect(t).toContain("Our method for teaching the barbell.");
    expect(t).toContain("Youth coaching education");
    // The action sits after the band element closes, on canvas, in ink.
    const band = out.indexOf('data-surface="band"');
    const actionAt = out.indexOf("Start your first course");
    expect(band).toBeGreaterThanOrEqual(0);
    expect(out.slice(band, actionAt)).toMatch(/<\/div>[\s\S]*<a /);
    expect(out).toMatch(/<a [^>]*class="[^"]*bg-ink/);
  });

  it("falls back to the brand name, then the fixed fallback, and omits a pending tagline", () => {
    const pending = { headline: null, tagline: null, modalities: [] };
    expect(text(html(createElement(CatalogHero, { brand: BRAND, hero: pending, fontFamily: FONT, action })))).toContain("Example Strength Club");
    const out = text(html(createElement(CatalogHero, { brand: PENDING, hero: pending, fontFamily: FONT, action })));
    expect(out).toContain(TENANT_TEXT_FALLBACKS.brandName);
    expect(out).not.toContain("Our method");
  });
});

describe("CourseCard", () => {
  it("is one link per card, named by its title", () => {
    const out = html(createElement(CourseCard, { course: course({}), fontFamily: FONT }));
    expect(out.match(/<a /g)).toHaveLength(1);
    expect(out).toMatch(/<a [^>]*aria-labelledby="[^"]+"/);
    expect(text(out)).toContain("Squat pattern coaching");
    expect(text(out)).toContain("Gym method");
  });

  it("shows the fixed fallback for a pending title and omits a pending blurb", () => {
    const out = text(html(createElement(CourseCard, { course: course({ title: null, blurb: null }), fontFamily: FONT })));
    expect(out).toContain(TENANT_TEXT_FALLBACKS.courseTitle);
    expect(out).not.toContain("How we teach");
  });

  it("draws a method course's own cover, and Spindle's neutral cover for Base and Modality", () => {
    expect(html(createElement(CourseCard, { course: course({}), fontFamily: FONT }))).toContain('data-pattern="diagonal"');
    for (const layer of ["base", "modality"] as const) {
      const out = html(createElement(CourseCard, { course: course({ layer }), fontFamily: FONT }));
      expect(out, layer).toContain(`data-pattern="${NEUTRAL_COVER.pattern}"`);
      expect(out, layer).toContain(NEUTRAL_COVER.background);
    }
  });

  it("adds the seal to Base cards, 'Published by Spindle' to Modality cards, and neither to method cards", () => {
    const base = text(html(createElement(CourseCard, { course: course({ layer: "base" }), fontFamily: FONT })));
    const modality = text(html(createElement(CourseCard, { course: course({ layer: "modality" }), fontFamily: FONT })));
    const method = text(html(createElement(CourseCard, { course: course({}), fontFamily: FONT })));
    expect(base).toContain(BASE_ATTRIBUTION);
    expect(modality).toContain("Published by Spindle");
    expect(modality).not.toContain(BASE_ATTRIBUTION);
    expect(method).not.toContain(BASE_ATTRIBUTION);
    expect(method).not.toContain("Published by Spindle");
  });
});

describe("CourseCover", () => {
  it.each(COVER_PATTERNS)("draws %s as decorative SVG with no text", (pattern) => {
    const out = html(createElement(CourseCover, { cover: { pattern, background: "#2f6b57", foreground: "#ffffff" } }));
    expect(out).toMatch(/^<svg[^>]*aria-hidden="true"/);
    expect(out).toContain(`data-pattern="${pattern}"`);
    expect(out).toContain('fill="#2f6b57"');
    expect(out).not.toMatch(/<text|<title|<desc/);
    if (pattern !== "solid") expect(out).toMatch(/<(path|circle)/);
  });
});

describe("CoachNote", () => {
  it("names the frozen display name, carries the fixed practice label and caption", () => {
    const out = decode(text(html(createElement(CoachNote, { note: { text: "Start with the setup.", displayName: "Coach A. Example" } }))));
    expect(out).toContain("Note from Coach A. Example");
    expect(out).toContain("Practice-based");
    expect(out).toContain("Start with the setup.");
    expect(out).toContain("Coach's note. Based on coaching practice, not a research claim.");
  });

  it("falls back to the fixed name when none was frozen", () => {
    expect(text(html(createElement(CoachNote, { note: { text: "x", displayName: null } })))).toContain(`Note from ${TENANT_TEXT_FALLBACKS.brandName}`);
  });
});

describe("BaseSeal and ModalityChip", () => {
  it("the seal is the fixed attribution beside the Spindle symbol", () => {
    const out = html(createElement(BaseSeal));
    expect(text(out)).toBe(BASE_ATTRIBUTION);
    expect(out).toContain("/brand/spindle-symbol.svg");
  });

  it("a youth tag reads as coaching education, and chips are not interactive", () => {
    const out = html(createElement(ModalityChip, { tag: "youth", on: "band" }));
    expect(text(out)).toBe("Youth coaching education");
    expect(out).not.toMatch(/<a |<button/);
    expect(html(createElement(ModalityChip, { tag: "yoga", on: "surface" }))).toContain("bg-surface-muted");
    expect(out).toContain("bg-band-tint");
  });
});

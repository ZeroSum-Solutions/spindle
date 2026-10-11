import { readFileSync } from "node:fs";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ATLAS, BASE_ATTRIBUTION, brandTokens, contrast } from "@spindle/engine";
import { BaseSeal } from "./base-seal";
import { BrandHeader } from "./brand-header";
import { CatalogHero } from "./catalog-hero";
import { CoachNote } from "./coach-note";
import { CourseCard } from "./course-card";
import { CourseCover } from "./course-cover";
import { ModalityChip } from "./modality-chip";
import { COVER_PATTERNS, memberColors, methodDefaultCover, NEUTRAL_COVER, TENANT_TEXT_FALLBACKS, type CourseCardView, type MemberBrandView } from "./view";

const html = (el: ReactElement) => renderToStaticMarkup(el);
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const decode = (s: string) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

const STRENGTH_BRAND = { mark: { kind: "text" }, colors: { accent: "#7a1b26", onAccent: "#ffffff", band: "#17232b" }, font: "barlow-condensed" } as const;
const COLORS = brandTokens(STRENGTH_BRAND.colors);
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

describe("member colours come from the engine (no local colour maths)", () => {
  it("are brandTokens for a brand validateOrgBrand accepts", () => {
    expect(memberColors(STRENGTH_BRAND)).toEqual(COLORS);
  });

  it("refuse a band whose header passes but whose chip text on the tint fails (#888888, Sol R1 on #42)", () => {
    const grey = { ...STRENGTH_BRAND, colors: { ...STRENGTH_BRAND.colors, band: "#888888" } };
    const t = brandTokens(grey.colors);
    expect(contrast(t.onBand, t.band)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.onBand, t.bandTint)).toBeLessThan(4.5);
    expect(memberColors(grey)).toBeNull();
  });

  it("refuse a band where neither ink nor white reaches 4.5:1", () => {
    expect(memberColors({ ...STRENGTH_BRAND, colors: { ...STRENGTH_BRAND.colors, band: "#777777" } })).toBeNull();
  });
});

describe("fixed Atlas pairs the brand components draw (DESIGN.md › Colors, checked tenant contrast)", () => {
  // Fixed pairs only: a change to the Atlas tokens must not silently break one.
  const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  const token = (name: string) => css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`))![1]!.toLowerCase();
  const ink = token("ink"), inkHover = token("ink-hover"), control = token("control");
  it.each([
    ["ink action text", "#ffffff", ink, 4.5],
    ["ink action text, hover", "#ffffff", inkHover, 4.5],
    ["card title on surface", ATLAS.text, ATLAS.surface, 4.5],
    ["card chip on surface-muted", ATLAS.text, ATLAS.surfaceMuted, 4.5],
    ["card meta on surface", ATLAS.textMuted, ATLAS.surface, 4.5],
    ["card meta on surface-muted", ATLAS.textMuted, ATLAS.surfaceMuted, 4.5],
    ["card hover edge", control, ATLAS.surface, 3],
    ["coach note body", ATLAS.text, ATLAS.surface, 4.5],
    ["coach note caption", ATLAS.textMuted, ATLAS.surface, 4.5],
    ["practice chip", ATLAS.practice, ATLAS.practiceSoft, 4.5],
    ["practice rule", ATLAS.practice, ATLAS.surface, 3],
    ["seal text on surface", ATLAS.textMuted, ATLAS.surface, 4.5],
    ["seal text on canvas", ATLAS.textMuted, ATLAS.canvas, 4.5],
  ] as const)("%s meets its minimum", (_, fg, bg, min) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(min);
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
    const out = html(createElement(CourseCard, { course: course({}), colors: COLORS, fontFamily: FONT }));
    expect(out.match(/<a /g)).toHaveLength(1);
    expect(out).toMatch(/<a [^>]*aria-labelledby="[^"]+"/);
    expect(text(out)).toContain("Squat pattern coaching");
    expect(text(out)).toContain("Gym method");
  });

  it("shows the fixed fallback for a pending title and omits a pending blurb", () => {
    const out = text(html(createElement(CourseCard, { course: course({ title: null, blurb: null }), colors: COLORS, fontFamily: FONT })));
    expect(out).toContain(TENANT_TEXT_FALLBACKS.courseTitle);
    expect(out).not.toContain("How we teach");
  });

  it("draws a method course's own cover, and Spindle's neutral cover for Base and Modality", () => {
    expect(html(createElement(CourseCard, { course: course({}), colors: COLORS, fontFamily: FONT }))).toContain('data-pattern="diagonal"');
    for (const layer of ["base", "modality"] as const) {
      const out = html(createElement(CourseCard, { course: course({ layer }), colors: COLORS, fontFamily: FONT }));
      expect(out, layer).toContain(`data-pattern="${NEUTRAL_COVER.pattern}"`);
      expect(out, layer).toContain(NEUTRAL_COVER.background);
    }
  });

  it("draws a method course without a cover as diagonal in the accent", () => {
    expect(methodDefaultCover(COLORS)).toEqual({ pattern: "diagonal", background: COLORS.accent, foreground: COLORS.onAccent });
    const out = html(createElement(CourseCard, { course: course({ cover: undefined }), colors: COLORS, fontFamily: FONT }));
    expect(out).toContain('data-pattern="diagonal"');
    expect(out).toContain(`fill="${COLORS.accent}"`);
  });

  it("takes its heading level from the section it sits in", () => {
    expect(html(createElement(CourseCard, { course: course({}), colors: COLORS, fontFamily: FONT }))).toMatch(/<h3 /);
    expect(html(createElement(CourseCard, { course: course({}), colors: COLORS, fontFamily: FONT, headingLevel: 4 }))).toMatch(/<h4 /);
  });

  it("adds the seal to Base cards, 'Published by Spindle' to Modality cards, and neither to method cards", () => {
    const base = text(html(createElement(CourseCard, { course: course({ layer: "base" }), colors: COLORS, fontFamily: FONT })));
    const modality = text(html(createElement(CourseCard, { course: course({ layer: "modality" }), colors: COLORS, fontFamily: FONT })));
    const method = text(html(createElement(CourseCard, { course: course({}), colors: COLORS, fontFamily: FONT })));
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
    // Drawn faintly: the foreground at 18% (spec rev4 §2).
    expect(out).toMatch(/(stroke|fill)-opacity="0.18"/);
    expect(out).not.toMatch(/(stroke|fill)-opacity="0\.(?!18")/);
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

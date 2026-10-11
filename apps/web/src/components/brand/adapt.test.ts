import { describe, expect, it } from "vitest";
import { brandTokens } from "@spindle/engine";
import type { CourseCardDto, MemberBrandDto } from "@spindle/schema";
import { brandFromDto, cardFromDto, catalogAction, catalogCards, shownCourseTitle, versionTexts, type CatalogAssignment } from "./adapt";
import { TENANT_TEXT_FALLBACKS } from "./view";

const ORG = "00000000-0000-4000-8000-0000000000a1";
const DTO: MemberBrandDto = {
  orgId: ORG,
  revision: 3,
  name: "Example Strength Club",
  nameAdmitted: true,
  brand: { mark: { kind: "text" }, colors: { accent: "#7a1b26", onAccent: "#ffffff", band: "#17232b" }, font: "barlow-condensed" },
  texts: { headline: "Lift well. Coach better.", tagline: "Our method for teaching the barbell.", coachName: "Coach A. Example" },
};
const CARD: CourseCardDto = {
  versionId: "00000000-0000-4000-8000-0000000000b1",
  courseId: "00000000-0000-4000-8000-0000000000c1",
  layer: "method",
  layerLabel: "Gym method",
  title: "Squat pattern coaching",
  summary: "How we set up, cue and progress the squat.",
  cover: { kind: "pattern", pattern: "diagonal", background: "#17232b", foreground: "#ffffff" },
  tags: ["strength", "not-a-tag"],
  lessonCount: 6,
  durationMinutes: 75,
  publishedBySpindle: false,
  seal: false,
};

describe("brandFromDto", () => {
  it("maps a saved brand with admitted texts; colours only through memberColors", () => {
    const out = brandFromDto(DTO)!;
    expect(out.brand).toEqual({ name: "Example Strength Club", font: "barlow-condensed", colors: brandTokens(DTO.brand!.colors) });
    expect(out.hero).toEqual({ headline: "Lift well. Coach better.", tagline: "Our method for teaching the barbell.", modalities: [] });
  });

  it("holds a pending name and pending hero texts as null, so the components show the fallbacks", () => {
    const out = brandFromDto({ ...DTO, name: TENANT_TEXT_FALLBACKS.brandName, nameAdmitted: false, texts: {} })!;
    expect(out.brand.name).toBeNull();
    expect(out.hero).toEqual({ headline: null, tagline: null, modalities: [] });
  });

  it("is null without a saved brand, and null for a brand the engine refuses", () => {
    expect(brandFromDto({ ...DTO, brand: null })).toBeNull();
    expect(brandFromDto({ ...DTO, brand: { ...DTO.brand!, colors: { ...DTO.brand!.colors, band: "#888888" } } })).toBeNull();
  });
});

describe("cardFromDto", () => {
  it("keeps the DTO's admitted title and blurb, its cover and known tags, and builds a fixed meta line", () => {
    expect(cardFromDto(CARD, "/gyms/x/learn/a1")).toEqual({
      id: CARD.versionId,
      href: "/gyms/x/learn/a1",
      layer: "method",
      title: "Squat pattern coaching",
      blurb: "How we set up, cue and progress the squat.",
      tags: ["strength"],
      meta: "6 lessons · About 1 hr 15 min",
      cover: { pattern: "diagonal", background: "#17232b", foreground: "#ffffff" },
    });
  });

  it("leaves Spindle's courses without a tenant cover, and a missing summary out", () => {
    const base = cardFromDto({ ...CARD, layer: "base", layerLabel: "Base", cover: null, summary: null, publishedBySpindle: true, seal: true, lessonCount: 1, durationMinutes: 12 }, "#");
    expect(base.cover).toBeUndefined();
    expect(base.blurb).toBeNull();
    expect(base.meta).toBe("1 lesson · About 12 min");
  });
});

describe("versionTexts and shownCourseTitle", () => {
  const row = (slot: "course_title" | "welcome" | "course_blurb", state: "live" | "revoked", text: string | null, displayName: string | null = null) => ({
    slot,
    state,
    text,
    displayName,
    authorUserId: null,
    savedAt: null,
  });

  it("shows a live welcome with its frozen name and a live blurb", () => {
    expect(versionTexts([row("course_title", "live", "Squat"), row("welcome", "live", "Start with the setup.", "Coach A. Example"), row("course_blurb", "live", "How we squat.")])).toEqual({
      titleRevoked: false,
      welcome: { text: "Start with the setup.", displayName: "Coach A. Example" },
      blurb: "How we squat.",
    });
  });

  it("drops revoked notes and blurbs, and a revoked title reads as the fallback", () => {
    const t = versionTexts([row("course_title", "revoked", null), row("welcome", "revoked", null), row("course_blurb", "revoked", null)]);
    expect(t).toEqual({ titleRevoked: true, welcome: null, blurb: null });
    expect(shownCourseTitle("Squat pattern coaching", t)).toBe(TENANT_TEXT_FALLBACKS.courseTitle);
    expect(shownCourseTitle("Squat pattern coaching", { titleRevoked: false })).toBe("Squat pattern coaching");
  });

  it("has nothing to show for a version without held texts (base and modality courses)", () => {
    expect(versionTexts([])).toEqual({ titleRevoked: false, welcome: null, blurb: null });
  });
});

describe("catalogCards (Sol R1 on #45)", () => {
  const assignment = (id: string, n: number, title: string, over: Partial<CatalogAssignment> = {}): CatalogAssignment => ({
    id,
    versionNumber: n,
    available: true,
    view: { title, layer: "method", done: 0, next: { slug: "first" } },
    card: { cover: { pattern: "grid", background: "#7a1b26", foreground: "#ffffff" }, tags: ["strength"], lessonCount: 2, durationMinutes: 10, blurb: `Blurb of v${n}` },
    ...over,
  });

  it("describes the version the card opens: v1 assigned while v2 is published gives v1's title, blurb and lessons", () => {
    const [entry] = catalogCards([{ latest: assignment("a1", 1, "Squat v1"), earlier: [] }], "/gyms/x/learn");
    expect(entry!.card).toMatchObject({ href: "/gyms/x/learn/a1", title: "Squat v1", blurb: "Blurb of v1", meta: "2 lessons · About 10 min", layer: "method" });
  });

  it("keeps earlier assigned versions reachable as links beside the card", () => {
    const [entry] = catalogCards([{ latest: assignment("a2", 2, "Squat v2"), earlier: [assignment("a1", 1, "Squat v1")] }], "/gyms/x/learn");
    expect(entry!.card.href).toBe("/gyms/x/learn/a2");
    expect(entry!.earlier).toEqual([{ href: "/gyms/x/learn/a1", label: "Version 1" }]);
  });

  it("leaves out a course whose newest assigned version cannot be displayed", () => {
    expect(catalogCards([{ latest: { id: "a9", versionNumber: 1, available: false }, earlier: [] }], "/b")).toEqual([]);
  });

  it("acts on progress: start when nothing is started, continue when something is, nothing when all is done", () => {
    const fresh = assignment("a1", 1, "Squat");
    const started = assignment("a1", 1, "Squat", { view: { title: "Squat", layer: "method", done: 1, next: { slug: "second" } } });
    const done = assignment("a1", 1, "Squat", { view: { title: "Squat", layer: "method", done: 2, next: null } });
    expect(catalogAction([{ latest: fresh }], "/b")).toEqual({ label: "Start your first course", href: "/b/a1/first" });
    expect(catalogAction([{ latest: started }], "/b")).toEqual({ label: "Continue where you left off", href: "/b/a1/second" });
    expect(catalogAction([{ latest: done }, { latest: { ...fresh, id: "a2", view: { ...fresh.view!, done: 1, next: null } } }], "/b")).toBeUndefined();
  });
});

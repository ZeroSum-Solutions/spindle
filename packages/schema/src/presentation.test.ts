// P4-A2: cover, tags and held tenant texts (welcome note, blurb) on the course shape. Synthetic only.
// The snapshot fixture mirrors what private.course_snapshot freezes (course_presentation.test.sql).
import { describe, expect, it } from "vitest";
import { ContentParseError, lessonViewCourse, parseCourse, parseCourseDraft, parseLearnerCourse, parseVersionTenantTexts } from "./index";

const method = (extra: Record<string, unknown> = {}) => ({
  id: "a1000000-0000-4000-8000-000000000000",
  slug: "course-a1",
  layer: "method",
  title: "Hinge basics",
  subtitle: "How we coach the hinge",
  description: "Synthetic test content.",
  level: "foundation",
  outcomes: [],
  parts: [
    {
      id: "a1000000-0000-4000-8000-0000000000f1",
      ordinal: 1,
      title: "Part one",
      summary: "",
      lessons: [
        {
          id: "a1000000-0000-4000-8000-0000000000a1",
          slug: "set-up",
          title: "Set-up",
          summary: "Synthetic fixture.",
          durationMinutes: 5,
          format: "article",
          objectives: [],
          anatomyIds: [],
          blocks: [{ kind: "paragraph", content: "Brace, then hinge.", support: "practice-based", claimIds: [] }],
          media: [],
          resources: [],
        },
      ],
    },
  ],
  ...extra,
});

const cover = { kind: "pattern", pattern: "diagonal", background: "#1f6feb", foreground: "#ffffff" };
const welcome = {
  text: "Welcome! We start with drills for the hips.",
  receiptId: "c0000000-0000-4000-8000-000000000001",
  author: {
    authorUserId: "00000000-0000-0000-0000-0000000000a2",
    displayName: "Gym A",
    orgId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    savedAt: "2026-10-11T14:36:31.328660Z",
  },
};
const blurb = {
  text: "Hinge patterns for new lifters.",
  receiptId: "c0000000-0000-4000-8000-000000000002",
  author: { authorUserId: "00000000-0000-0000-0000-0000000000a1", savedAt: "2026-10-11T14:36:31.328660Z" },
};
const published = method({ cover, tags: ["strength", "youth"], welcome, blurb, titleReceiptId: "c0000000-0000-4000-8000-000000000003" });

describe("a published method course with presentation and admitted texts", () => {
  it("round-trips through the course, learner and lesson-view parsers", () => {
    expect(parseCourse(published)).toEqual(published);
    const learner = parseLearnerCourse(published);
    expect(learner).toEqual(published);
    expect(lessonViewCourse(learner)).toMatchObject({ cover, tags: ["strength", "youth"], welcome, blurb });
  });

  it("parses a course without them, as every earlier snapshot is", () => {
    const plain = method();
    expect(parseLearnerCourse(plain)).toEqual(plain);
    expect("cover" in parseLearnerCourse(plain)).toBe(false);
  });

  it.each([
    ["an unknown cover key", { cover: { ...cover, assetId: "x" } }],
    ["an image cover", { cover: { ...cover, kind: "image" } }],
    ["an unknown pattern", { cover: { ...cover, pattern: "stripes" } }],
    ["a named colour", { cover: { ...cover, background: "red" } }],
    ["a tag outside the taxonomy", { tags: ["crossfit"] }],
    ["three tags", { tags: ["strength", "speed", "yoga"] }],
    ["a duplicate tag", { tags: ["yoga", "yoga"] }],
    ["an unknown welcome key", { welcome: { ...welcome, photo: "x" } }],
    ["an unknown author key", { welcome: { ...welcome, author: { ...welcome.author, role: "Coach" } } }],
    ["a welcome note over 280 characters", { welcome: { ...welcome, text: "a".repeat(281) } }],
    ["a blurb over 160 characters", { blurb: { ...blurb, text: "a".repeat(161) } }],
    ["a bare-string blurb", { blurb: "Hinge patterns." }],
    ["a welcome note without its receipt", { welcome: { text: welcome.text, author: welcome.author } }],
    ["a malformed title receipt", { titleReceiptId: "not-a-uuid" }],
    ["an unknown course key", { brand: {} }],
  ])("refuses %s at every hop", (_label, extra) => {
    expect(() => parseCourse(method(extra))).toThrow(ContentParseError);
    expect(() => parseLearnerCourse(method(extra))).toThrow(ContentParseError);
  });

  it("keeps cover, welcome note and blurb to gym method courses", () => {
    for (const extra of [{ cover }, { welcome }, { blurb }, { titleReceiptId: blurb.receiptId }]) {
      expect(() => parseCourse(method({ layer: "base", ...extra }))).toThrow(/only gym method courses/);
    }
    expect(parseCourse(method({ layer: "base", tags: ["mobility"] })).tags).toEqual(["mobility"]);
  });
});

describe("a course draft", () => {
  it("carries cover and tags but never a held tenant text", () => {
    expect(parseCourseDraft(method({ cover, tags: ["strength"] }))).toMatchObject({ cover, tags: ["strength"] });
    expect(() => parseCourseDraft(method({ welcome }))).toThrow(/save_tenant_text/);
    expect(() => parseCourseDraft(method({ blurb }))).toThrow(/save_tenant_text/);
    expect(() => parseCourseDraft(method({ titleReceiptId: blurb.receiptId }))).toThrow(/admission/);
  });
});

describe("version_tenant_texts rows", () => {
  it("parse live and revoked texts, and nothing else", () => {
    expect(
      parseVersionTenantTexts([
        { slot: "course_title", state: "revoked", text: "Untitled course", display_name: null, author_user_id: null, saved_at: null },
        { slot: "welcome", state: "revoked", text: null, display_name: null, author_user_id: null, saved_at: null },
      ]),
    ).toEqual([
      { slot: "course_title", state: "revoked", text: "Untitled course", displayName: null, authorUserId: null, savedAt: null },
      { slot: "welcome", state: "revoked", text: null, displayName: null, authorUserId: null, savedAt: null },
    ]);
    expect(() => parseVersionTenantTexts([{ slot: "brand_name", state: "live", text: "x", display_name: null, author_user_id: null, saved_at: null }])).toThrow(
      ContentParseError,
    );
  });
});

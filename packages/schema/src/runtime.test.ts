// Synthetic fixtures only: no tenant content and no real teaching text.
import { describe, expect, it } from "vitest";
import { ContentParseError, isSafeContentUrl, parseCatalog, parseCourse, parseLessonCompletions, parseVersionManifest } from "./index";

function block(overrides: Record<string, unknown> = {}) {
  return { kind: "paragraph", content: "Synthetic text.", support: "practice-based", claimIds: [], ...overrides };
}

function lesson(id: string, blocks: unknown[] = [block()]) {
  return {
    id,
    slug: id,
    title: `Lesson ${id}`,
    summary: "",
    durationMinutes: 5,
    format: "article",
    objectives: [],
    anatomyIds: ["UBERON:0000001"],
    blocks,
    media: [{ kind: "image", src: "/media/x.webp", alt: "x", caption: "", provenanceId: "art-1" }],
    resources: [{ label: "Sheet", href: "https://example.org/sheet.pdf", type: "worksheet" }],
  };
}

function course(lessons: unknown[] = [lesson("l1")]) {
  return {
    id: "c1",
    slug: "synthetic-course",
    layer: "base",
    title: "Synthetic",
    subtitle: "",
    description: "",
    level: "foundation",
    outcomes: [],
    parts: [{ id: "p1", ordinal: 1, title: "Part", summary: "", lessons }],
  };
}

const catalog = (c: unknown = course()) => ({ version: "test", courses: [c] });

describe("content ingress", () => {
  it("accepts a well-formed catalog and returns the typed tree", () => {
    const parsed = parseCatalog(catalog());
    expect(parsed.courses[0]?.parts[0]?.lessons[0]?.id).toBe("l1");
  });

  it("accepts every block kind", () => {
    const blocks = [
      { kind: "heading", content: "H" },
      block(),
      block({ kind: "callout", content: { label: "Note", text: "T" } }),
      { kind: "image", content: { kind: "image", src: "/a.png", alt: "a", caption: "", provenanceId: "art-1" } },
      block({ kind: "checklist", content: ["one"] }),
      { kind: "diagram", content: { diagramId: "d1", caption: "" } },
      block({ kind: "quiz", content: { prompt: "P?", options: ["A", "B"], answerIndex: 1, explanation: "E" } }),
      block({ support: "science", claimIds: ["claim-1"] }),
    ];
    expect(() => parseCourse(course([lesson("l1", blocks)]))).not.toThrow();
  });

  it("rejects non-objects and unknown keys", () => {
    expect(() => parseCatalog(null)).toThrow(ContentParseError);
    expect(() => parseCourse({ ...course(), owner: "x" })).toThrow(/owner/);
    expect(() => parseCourse(course([{ ...lesson("l1"), html: "<b>" }]))).toThrow(ContentParseError);
  });

  it("rejects unknown block kinds and enum values", () => {
    expect(() => parseCourse(course([lesson("l1", [{ kind: "script", content: "x" }])]))).toThrow(ContentParseError);
    expect(() => parseCourse({ ...course(), layer: "global" })).toThrow(/layer/);
  });

  it("reports the path of the failing field", () => {
    const bad = course([lesson("l1", [block({ content: 42 })])]);
    expect(() => parseCourse(bad)).toThrow(/parts\.0\.lessons\.0\.blocks\.0/);
  });

  it.each([
    ["javascript:alert(1)"],
    ["data:image/png;base64,AAAA"],
    ["http://example.org/x.png"],
    ["//evil.example/x.png"],
    ["/\\evil.example/x.png"],
    ["/media/../secret.png"],
    ["/media/%2e%2e/secret.png"],
    ["media/x.png"],
    ["https://user:pass@example.org/x.png"],
    ["https://example.org@evil.example/x.png"],
    ["https:/example.org/x.png"],
    ["https://example.org:99999/a.png"],
    ["https://example.org:0/a.png"],
    ["https://example.org:/a.png"],
    ["https://1.2.3.999/a.png"],
    ["https://example.123/a.png"],
    ["https://xn--zz.org/a.png"],
    ["ftp://example.org/x.png"],
    ["/media/x .png"],
    ["/media/x\n.png"],
    [""],
  ])("rejects unsafe media src %j", (src) => {
    const l = lesson("l1");
    l.media[0]!.src = src;
    expect(() => parseCourse(course([l]))).toThrow(/src/);
    expect(isSafeContentUrl(src)).toBe(false);
  });

  it.each([
    ["/media/x.webp"],
    ["https://example.org/x.png?w=2"],
    ["https://cdn.example.org:8443/a/b.svg"],
    ["https://example.org:65535/a.png"],
  ])("accepts safe url %j", (src) => {
    expect(isSafeContentUrl(src)).toBe(true);
  });

  it("rejects an unsafe resource href and an unsafe image block src", () => {
    const l = lesson("l1");
    l.resources[0]!.href = "javascript:void(0)";
    expect(() => parseCourse(course([l]))).toThrow(/href/);
    const img = { kind: "image", content: { kind: "image", src: "data:x", alt: "a", caption: "", provenanceId: "p" } };
    expect(() => parseCourse(course([lesson("l2", [img])]))).toThrow(/src/);
  });

  it("requires alt text on media", () => {
    const l = lesson("l1");
    l.media[0]!.alt = " ";
    expect(() => parseCourse(course([l]))).toThrow(/alt/);
  });

  describe("evidence binding shape", () => {
    it.each([
      ["science without claims", { support: "science", claimIds: [] }],
      ["practice-based with claims", { support: "practice-based", claimIds: ["claim-1"] }],
      ["missing support", { support: undefined }],
      ["missing claimIds", { claimIds: undefined }],
      ["claimIds not an array", { support: "science", claimIds: "claim-1" }],
      ["empty claim id", { support: "science", claimIds: [""] }],
      ["whitespace claim id", { support: "science", claimIds: ["claim 1"] }],
      ["duplicate claim ids", { support: "science", claimIds: ["claim-1", "claim-1"] }],
      ["object claim id", { support: "science", claimIds: [{ id: "claim-1" }] }],
      ["unknown support", { support: "anecdote" }],
    ])("rejects %s", (_name, overrides) => {
      expect(() => parseCourse(course([lesson("l1", [block(overrides)])]))).toThrow(ContentParseError);
    });

    it("rejects claim bindings on blocks that cannot carry support", () => {
      const heading = { kind: "heading", content: "H", support: "science", claimIds: ["claim-1"] };
      expect(() => parseCourse(course([lesson("l1", [heading])]))).toThrow(ContentParseError);
    });
  });

  it("rejects a malformed quiz shape", () => {
    const quiz = (content: unknown) => block({ kind: "quiz", content });
    const base = { prompt: "P?", options: ["A", "B"], answerIndex: 0, explanation: "E" };
    for (const content of [
      { ...base, options: ["A"] },
      { ...base, answerIndex: 2 },
      { ...base, answerIndex: 0.5 },
      { ...base, answerIndex: -1 },
    ]) {
      expect(() => parseCourse(course([lesson("l1", [quiz(content)])]))).toThrow(ContentParseError);
    }
  });

  it("rejects malformed identifiers and numbers", () => {
    expect(() => parseCourse({ ...course(), slug: "Bad Slug" })).toThrow(/slug/);
    expect(() => parseCourse(course([{ ...lesson("l1"), anatomyIds: ["shoulder"] }]))).toThrow(/anatomyIds/);
    expect(() => parseCourse(course([{ ...lesson("l1"), durationMinutes: -1 }]))).toThrow(/durationMinutes/);
    expect(() => parseCourse(course([{ ...lesson("l1"), id: "" }]))).toThrow(/id/);
  });
});

describe("version contracts", () => {
  const hashA = "a".repeat(64);
  const hashB = "0123456789abcdef".repeat(4);
  const manifest = {
    versionId: "v1",
    lessons: [
      { lessonId: "l1", contentHash: hashA },
      { lessonId: "l2", contentHash: hashB },
    ],
  };

  it("accepts a manifest of database sha256 hashes", () => {
    expect(parseVersionManifest(manifest).lessons).toHaveLength(2);
  });

  it("rejects duplicate lessons, malformed hashes and extra keys", () => {
    const dup = { ...manifest, lessons: [manifest.lessons[0], manifest.lessons[0]] };
    expect(() => parseVersionManifest(dup)).toThrow(/Duplicate lesson l1/);
    for (const contentHash of ["", "A".repeat(64), "a".repeat(63), `sha256:${hashA}`]) {
      expect(() => parseVersionManifest({ ...manifest, lessons: [{ lessonId: "l1", contentHash }] })).toThrow(
        /contentHash/,
      );
    }
    expect(() => parseVersionManifest({ ...manifest, hash: hashA })).toThrow(ContentParseError);
  });

  it("parses completions with root lineage and rejects malformed ones", () => {
    const direct = {
      id: "done-1",
      lessonId: "l1",
      versionId: "v1",
      contentHash: hashA,
      completedAt: "2026-10-10T12:00:00Z",
      originCompletionId: null,
    };
    const carried = { ...direct, id: "done-2", versionId: "v2", originCompletionId: "done-1" };
    expect(parseLessonCompletions([direct, carried])).toEqual([direct, carried]);
    expect(() => parseLessonCompletions([{ ...direct, completedAt: "yesterday" }])).toThrow(/completedAt/);
    const micro = { ...direct, completedAt: "2026-10-10T12:00:00.000001+05:30" };
    expect(parseLessonCompletions([micro])).toEqual([micro]);
    // PostgreSQL keeps microseconds; finer input would be rounded and could reorder completions.
    expect(() => parseLessonCompletions([{ ...direct, completedAt: "2026-10-10T12:00:00.0000001Z" }])).toThrow(
      /completedAt/,
    );
    expect(() => parseLessonCompletions([{ ...direct, originCompletionId: undefined }])).toThrow(/originCompletionId/);
    expect(() => parseLessonCompletions({ rows: [direct] })).toThrow(ContentParseError);
  });
});

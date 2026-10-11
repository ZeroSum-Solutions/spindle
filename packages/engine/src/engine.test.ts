import { describe, expect, it } from "vitest";
import type { Catalog, Course, Lesson, LessonBlock } from "@spindle/schema";
import {
  completeLesson,
  coursePercent,
  emptyProgress,
  findLesson,
  flattenLessons,
  nextLesson,
  normalizeProgress,
  overallPercent,
  searchCatalog,
  validateCatalog,
} from "./index";

const provenance = new Set(["art-1"]);
const approved = new Set(["claim-approved"]);
const claims = { isPublishable: (id: string) => approved.has(id) };

function lesson(id: string, blocks: LessonBlock[] = []): Lesson {
  return {
    id,
    slug: id,
    title: `Lesson ${id}`,
    summary: "Scapular upward rotation",
    durationMinutes: 5,
    format: "article",
    objectives: [],
    anatomyIds: [],
    blocks,
    media: [],
    resources: [],
  };
}

function fixture(): Catalog {
  const course: Course = {
    id: "c1",
    slug: "shoulder",
    layer: "base",
    title: "Shoulder complex",
    subtitle: "",
    description: "",
    level: "foundation",
    outcomes: [],
    parts: [
      { id: "p1", ordinal: 1, title: "Anatomy", summary: "", lessons: [lesson("l1"), lesson("l2")] },
      { id: "p2", ordinal: 2, title: "Movement", summary: "", lessons: [lesson("l3"), lesson("l4")] },
    ],
  };
  return { version: "test", courses: [course] };
}

const firstCourse = (catalog: Catalog): Course => catalog.courses[0]!;

describe("catalog contract", () => {
  it("accepts a valid catalog", () => {
    expect(() => validateCatalog(fixture(), provenance, claims)).not.toThrow();
  });

  it("rejects duplicate lesson slugs inside a course", () => {
    const catalog = fixture();
    firstCourse(catalog).parts[1]!.lessons[0]!.slug = "l1";
    expect(() => validateCatalog(catalog, provenance, claims)).toThrow(/Duplicate lesson slug/);
  });

  it("rejects media without a provenance record", () => {
    const catalog = fixture();
    firstCourse(catalog).parts[0]!.lessons[0]!.media.push({
      kind: "image",
      src: "/x.webp",
      alt: "x",
      caption: "x",
      provenanceId: "missing",
    });
    expect(() => validateCatalog(catalog, provenance, claims)).toThrow(/Missing provenance missing/);
  });

  it("rejects a science block without a claim", () => {
    const catalog = fixture();
    firstCourse(catalog).parts[0]!.lessons[0]!.blocks.push({
      kind: "paragraph",
      content: "The rotator cuff centres the humeral head.",
      support: "science",
      claimIds: [],
    });
    expect(() => validateCatalog(catalog, provenance, claims)).toThrow(/science block without a claim/);
  });

  it("rejects a practice-based block that carries claims", () => {
    const catalog = fixture();
    firstCourse(catalog).parts[0]!.lessons[0]!.blocks.push({
      kind: "paragraph",
      content: "Our gym cues a long spine first.",
      support: "practice-based",
      claimIds: ["claim-1"],
    });
    expect(() => validateCatalog(catalog, provenance, claims)).toThrow(/posing as science/);
  });

  function scienceBlock(claimIds: string[]): LessonBlock {
    return { kind: "paragraph", content: "The rotator cuff centres the humeral head.", support: "science", claimIds };
  }

  function quiz(options: string[], answerIndex: number): LessonBlock {
    return {
      kind: "quiz",
      content: { prompt: "Which muscle?", options, answerIndex, explanation: "Because." },
      support: "practice-based",
      claimIds: [],
    };
  }

  it("accepts a science block bound to an approved claim", () => {
    const catalog = fixture();
    firstCourse(catalog).parts[0]!.lessons[0]!.blocks.push(scienceBlock(["claim-approved"]));
    expect(() => validateCatalog(catalog, provenance, claims)).not.toThrow();
  });

  it.each([["claim-unknown"], ["claim-pending"]])("rejects a science block citing %s", (id) => {
    const catalog = fixture();
    firstCourse(catalog).parts[0]!.lessons[0]!.blocks.push(scienceBlock([id]));
    expect(() => validateCatalog(catalog, provenance, claims)).toThrow(/not approved/);
  });

  it("rejects science claims inside gym method courses", () => {
    const catalog = fixture();
    firstCourse(catalog).layer = "method";
    firstCourse(catalog).parts[0]!.lessons[0]!.blocks.push(scienceBlock(["claim-approved"]));
    expect(() => validateCatalog(catalog, provenance, claims)).toThrow(/cannot claim science/);
  });

  it.each([[10], [-1], [0.5], [2]])("rejects a quiz answer index of %s", (index) => {
    const catalog = fixture();
    firstCourse(catalog).parts[0]!.lessons[0]!.blocks.push(quiz(["A", "B"], index));
    expect(() => validateCatalog(catalog, provenance, claims)).toThrow(/quiz answer outside/);
  });

  it("accepts a quiz with a valid answer index", () => {
    const catalog = fixture();
    firstCourse(catalog).parts[0]!.lessons[0]!.blocks.push(quiz(["A", "B"], 1));
    expect(() => validateCatalog(catalog, provenance, claims)).not.toThrow();
  });

  it("finds lessons and the next lesson in order", () => {
    const catalog = fixture();
    const course = firstCourse(catalog);
    expect(findLesson(catalog, "shoulder", "l3")?.partIndex).toBe(1);
    expect(nextLesson(course, "l2")?.id).toBe("l3");
    expect(nextLesson(course, "l4")).toBeNull();
    expect(flattenLessons(catalog.courses)).toHaveLength(4);
  });

  it("searches deterministically", () => {
    const catalog = fixture();
    expect(searchCatalog(catalog, "scapular rotation").lessons).toHaveLength(4);
    expect(searchCatalog(catalog, "   ").lessons).toHaveLength(0);
  });
});

describe("progress", () => {
  it("normalizes malformed input to empty progress", () => {
    expect(normalizeProgress(null)).toEqual(emptyProgress);
    expect(normalizeProgress({ version: 2 })).toEqual(emptyProgress);
  });

  it("does not double-count a lesson completed twice", () => {
    const once = completeLesson(emptyProgress, "l1");
    const twice = completeLesson(once, "l1");
    expect(twice.completedLessonIds).toEqual(["l1"]);
    expect(coursePercent(firstCourse(fixture()), twice.completedLessonIds)).toBe(25);
  });

  it("ignores stale ids and caps at 100 percent", () => {
    const catalog = fixture();
    const all = { ...emptyProgress, completedLessonIds: ["l1", "l2", "l3", "l4", "stale"] };
    expect(overallPercent(catalog, all)).toBe(100);
  });
});

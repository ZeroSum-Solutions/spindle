// Synthetic fixtures only. Mirrors the database rules in supabase/tests/database/evidence.test.sql.
import { parseLearnerCourse, type Course, type LessonBlock } from "@spindle/schema";
import { describe, expect, it } from "vitest";
import { bestAttempt, blockEvidence, gradedQuestions, learnerQuestions, moduleCompletion, passes, quizCreditCarries, scoreAttempt, validateCatalog } from "./index";

const quiz = (prompt: string, support: "science" | "practice-based" = "science"): LessonBlock => ({
  kind: "quiz",
  support,
  claimIds: support === "science" ? ["c1"] : [],
  content: { prompt, options: ["Wrong", "Right"], answerIndex: 1, explanation: "Synthetic." },
});

function course(): Course {
  const lesson = (id: string, blocks: LessonBlock[]) => ({
    id, slug: id, title: id, summary: "", durationMinutes: 5, format: "article" as const, objectives: [], anatomyIds: [], blocks, media: [], resources: [],
  });
  return {
    id: "c", slug: "c", layer: "base", title: "C", subtitle: "", description: "", level: "foundation", outcomes: [],
    parts: [
      { id: "p1", ordinal: 1, title: "P1", summary: "", lessons: [lesson("l1", [{ kind: "heading", content: "H" }, quiz("Q1"), quiz("Practice", "practice-based"), quiz("Q2")])] },
      { id: "p2", ordinal: 2, title: "P2", summary: "", lessons: [lesson("l2", [quiz("Q3"), quiz("Q4"), quiz("Q5")])] },
    ],
  };
}

const answers = (picks: number[]) =>
  ["l1:q1", "l1:q2", "l2:q1", "l2:q2", "l2:q3"].map((questionId, i) => ({ questionId, answerIndex: picks[i]! }));

describe("graded questions", () => {
  it("are the science quiz blocks in course order, with per-lesson ids", () => {
    expect(gradedQuestions(course()).map((q) => [q.questionId, q.prompt])).toEqual([
      ["l1:q1", "Q1"], ["l1:q2", "Q2"], ["l2:q1", "Q3"], ["l2:q2", "Q4"], ["l2:q3", "Q5"],
    ]);
  });
});

describe("learner questions (Sol R1 PR22-01)", () => {
  // The learner projection: graded quizzes arrive without answerIndex and explanation.
  const redacted = () => {
    const c = course();
    return parseLearnerCourse({
      ...c,
      parts: c.parts.map((p) => ({ ...p, lessons: p.lessons.map((l) => ({ ...l, blocks: l.blocks.map((b) =>
        b.kind === "quiz" && b.support === "science" ? { ...b, content: { prompt: b.content.prompt, options: b.content.options } } : b) })) })),
    });
  };

  it("lists the graded questions of the learner projection with the database's ids, prompts and options, and no key", () => {
    const qs = learnerQuestions(redacted());
    expect(qs.map((q) => [q.questionId, q.lessonId, q.prompt])).toEqual(gradedQuestions(course()).map((q) => [q.questionId, q.lessonId, q.prompt]));
    expect(qs[0]).toEqual({ questionId: "l1:q1", lessonId: "l1", prompt: "Q1", options: ["Wrong", "Right"] });
  });

});

describe("scoring", () => {
  const questions = gradedQuestions(course());

  it("passes at exactly 80% and fails below", () => {
    expect(scoreAttempt(questions, answers([1, 1, 1, 1, 0]))).toMatchObject({ correct: 4, total: 5, passed: true });
    expect(scoreAttempt(questions, answers([1, 1, 1, 0, 0]))).toMatchObject({ correct: 3, total: 5, passed: false });
    expect(passes(0, 0)).toBe(false);
    expect(passes(8, 10)).toBe(true);
    expect(passes(79, 100)).toBe(false);
  });

  it("refuses incomplete, duplicate, unknown and out-of-range answers", () => {
    expect(() => scoreAttempt(questions, answers([1, 1, 1, 1, 1]).slice(0, 4))).toThrow(/every graded question needs exactly one answer/);
    expect(() => scoreAttempt(questions, [...answers([1, 1, 1, 1, 1]).slice(0, 4), { questionId: "l1:q1", answerIndex: 1 }])).toThrow(/answered twice/);
    expect(() => scoreAttempt(questions, [...answers([1, 1, 1, 1, 1]).slice(0, 4), { questionId: "l2:q9", answerIndex: 1 }])).toThrow(/not a graded question/);
    expect(() => scoreAttempt(questions, answers([1, 1, 1, 1, 2]))).toThrow(/outside its options/);
  });
});

describe("module completion", () => {
  const base = { lessonIds: ["l1", "l2"], completedLessonIds: ["l1", "l2"], rules: "phase3" as const, questionSetHash: "a".repeat(64), carriedPass: false };
  const attempt = (id: string, correct: number, at: string) => ({ id, correct, total: 5, submittedAt: at });

  it("needs every lesson and a passing best attempt", () => {
    expect(moduleCompletion({ ...base, attempts: [] }).complete).toBe(false);
    expect(moduleCompletion({ ...base, attempts: [attempt("a", 3, "2026-10-11T00:00:00Z")] }).complete).toBe(false);
    expect(moduleCompletion({ ...base, attempts: [attempt("a", 4, "2026-10-11T00:00:00Z"), attempt("b", 0, "2026-10-11T00:01:00Z")] })).toEqual({
      quizRequired: true, quizPassed: true, complete: true,
    });
    expect(moduleCompletion({ ...base, completedLessonIds: ["l1"], attempts: [attempt("a", 5, "2026-10-11T00:00:00Z")] }).complete).toBe(false);
  });

  it("accepts a carried pass and keeps the lessons-only rule before phase 3 or without graded questions", () => {
    expect(moduleCompletion({ ...base, attempts: [], carriedPass: true }).complete).toBe(true);
    expect(moduleCompletion({ ...base, rules: "phase2", questionSetHash: null, attempts: [] })).toEqual({ quizRequired: false, quizPassed: false, complete: true });
    expect(moduleCompletion({ ...base, questionSetHash: null, attempts: [] }).complete).toBe(true);
    expect(moduleCompletion({ ...base, lessonIds: [], completedLessonIds: [], questionSetHash: null, attempts: [] }).complete).toBe(false);
  });

  it("compares submission instants, not their spelling", () => {
    const a = { id: "a", correct: 4, total: 5, submittedAt: "2026-10-11T00:00:00Z" };
    const b = { id: "b", correct: 4, total: 5, submittedAt: "2026-10-11T01:00:00+01:00" };
    expect(bestAttempt([b, a])?.id).toBe("a");
    const early = { id: "z", correct: 4, total: 5, submittedAt: "2026-10-11T00:00:00.000001Z" };
    const earlier = { id: "y", correct: 4, total: 5, submittedAt: "2026-10-11T00:00:00.000002Z" };
    expect(bestAttempt([earlier, early])?.id).toBe("z");
  });

  it("picks the best attempt, earliest on a tie", () => {
    expect(bestAttempt([attempt("b", 4, "2026-10-11T00:01:00Z"), attempt("a", 4, "2026-10-11T00:00:00Z"), attempt("c", 2, "2026-10-10T00:00:00Z")])?.id).toBe("a");
    expect(bestAttempt([])).toBeNull();
  });

  it("carries quiz credit only on an unchanged, non-empty question set", () => {
    expect(quizCreditCarries("a".repeat(64), "a".repeat(64))).toBe(true);
    expect(quizCreditCarries("a".repeat(64), "b".repeat(64))).toBe(false);
    expect(quizCreditCarries(null, null)).toBe(false);
  });
});

describe("block evidence", () => {
  const states = new Map([["ok", "current"], ["w", "withdrawn"], ["r", "retracted"], ["e", "recheck_due"]] as const);

  it("drops the Science presentation for a withdrawn or unknown claim and flags the rest", () => {
    expect(blockEvidence(["ok"], states)).toEqual({ presentsAsScience: true, withdrawn: false, retracted: false, recheckDue: false });
    expect(blockEvidence(["ok", "w"], states).presentsAsScience).toBe(false);
    expect(blockEvidence(["missing"], states)).toMatchObject({ presentsAsScience: false, withdrawn: true });
    expect(blockEvidence(["r", "e"], states)).toEqual({ presentsAsScience: true, withdrawn: false, retracted: true, recheckDue: true });
    expect(blockEvidence([], states).presentsAsScience).toBe(false);
  });
});

describe("registry videos in a catalog", () => {
  const video: LessonBlock = { kind: "video", content: { mediaId: "m1", provider: "youtube", videoId: "AbCdEfGhIj0", startSeconds: 0, endSeconds: 10, rationale: "x", caption: "" } };
  const lookups = [{ has: () => true }, { isPublishable: () => true }] as const;
  const withVideo = (layer: Course["layer"]): Course => {
    const c = course();
    return { ...c, layer, parts: [{ ...c.parts[0]!, lessons: [{ ...c.parts[0]!.lessons[0]!, blocks: [video] }] }] };
  };

  it("refuse YouTube-family URLs as plain media in new content", () => {
    const c = course();
    const legacy: Course = { ...c, parts: [{ ...c.parts[0]!, lessons: [{ ...c.parts[0]!.lessons[0]!, blocks: [{ kind: "image", content: { kind: "image", src: "https://i.ytimg.com/vi/x/0.jpg", alt: "x", caption: "", provenanceId: "p1" } }] }] }] };
    expect(() => validateCatalog({ version: "t", courses: [legacy] }, ...lookups)).toThrow(/video host/);
    const lessonMedia: Course = { ...c, parts: [{ ...c.parts[0]!, lessons: [{ ...c.parts[0]!.lessons[0]!, media: [{ kind: "video", src: "https://youtu.be/x", alt: "x", caption: "", provenanceId: "p1" }] }] }] };
    expect(() => validateCatalog({ version: "t", courses: [lessonMedia] }, ...lookups)).toThrow(/video host/);
  });

  it("require stored media: /media/content/ for global content, plus /media/org/<gym>/ for gym content (P18-06)", () => {
    const c = course();
    const withImage = (src: string, layer: Course["layer"] = "base"): Course => ({ ...c, layer, parts: [{ ...c.parts[0]!, lessons: [{ ...c.parts[0]!.lessons[0]!, blocks: [{ kind: "image", content: { kind: "image", src, alt: "x", caption: "", provenanceId: "p1" } }] }] }] });
    const withMedia = (src: string): Course => ({ ...c, parts: [{ ...c.parts[0]!, lessons: [{ ...c.parts[0]!.lessons[0]!, media: [{ kind: "video", src, alt: "x", caption: "", provenanceId: "p1" }] }] }] });
    const ok = (course: Course) => () => validateCatalog({ version: "t", courses: [course] }, ...lookups);
    expect(ok(withImage("/media/content/shoulder/cuff.png"))).not.toThrow();
    expect(ok(withImage("https://cdn.example.org/cuff.png"))).toThrow(/stored file/);
    expect(ok(withImage("/media/org/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/x.png"))).toThrow(/stored file/);
    expect(ok(withImage("/media/org/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/x.png", "method"))).not.toThrow();
    expect(ok(withImage("/elsewhere/x.png"))).toThrow(/stored file/);
    expect(ok(withMedia("https://cdn.example.org/clip.mp4"))).toThrow(/stored file/);
    expect(ok(withMedia("/media/content/clip.mp4"))).not.toThrow();
  });

  it("refuse a legacy diagram without reviewable text in new content (R16)", () => {
    const c = course();
    const withBlock = (block: LessonBlock): Course => ({ ...c, parts: [{ ...c.parts[0]!, lessons: [{ ...c.parts[0]!.lessons[0]!, blocks: [block] }] }] });
    expect(() => validateCatalog({ version: "t", courses: [withBlock({ kind: "diagram", content: { diagramId: "d1", caption: "" } })] }, ...lookups)).toThrow(/reviewable text/);
    const ok: LessonBlock = { kind: "diagram", support: "practice-based", claimIds: [], content: { diagramId: "d1", alt: "x", caption: "", legend: [] } };
    expect(() => validateCatalog({ version: "t", courses: [withBlock(ok)] }, ...lookups)).not.toThrow();
  });

  it("refuse the reserved lesson slug quiz in new content", () => {
    const c = course();
    const named: Course = { ...c, parts: [{ ...c.parts[0]!, lessons: [{ ...c.parts[0]!.lessons[0]!, slug: "quiz" }] }] };
    expect(() => validateCatalog({ version: "t", courses: [named] }, ...lookups)).toThrow(/reserved/);
  });

  it("are allowed in global content and refused in gym method content", () => {
    expect(() => validateCatalog({ version: "t", courses: [withVideo("base")] }, ...lookups)).not.toThrow();
    expect(() => validateCatalog({ version: "t", courses: [withVideo("method")] }, ...lookups)).toThrow(/cannot embed registry videos/);
  });
});

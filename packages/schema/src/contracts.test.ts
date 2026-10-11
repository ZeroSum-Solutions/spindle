// Synthetic values only. Phase-3 contracts (ADR 0007): video blocks, the YouTube media rule,
// learner RPC rows and review receipt bodies.
import { describe, expect, it } from "vitest";
import {
  ContentParseError,
  blockReviewInputSchema,
  courseReviewInputSchema,
  parseReviewTargets,
  isVideoHostUrl,
  lessonBlockSchema,
  lessonReviewInputSchema,
  lessonSchema,
  RESERVED_LESSON_SLUGS,
  mediaAssetSchema,
  parseCourse,
  lessonViewCourse,
  parseLearnerCourse,
  parseModuleStatus,
  parseQuizAttemptResult,
  parseVersionIntegrity,
  parseVersionMedia,
  quizAnswersSchema,
} from "./index";

const UUID = "11111111-1111-4111-8111-111111111111";
const HASH = "a".repeat(64);
const video = { mediaId: UUID, provider: "youtube", videoId: "AbCdEfGhIj0", startSeconds: 30, endSeconds: 95, rationale: "Shows the rhythm.", caption: "" };
const run = { model: "synthetic-fixture", session: "ci-1", packetDigest: HASH, reviewedAt: "2026-10-01T00:00:00Z" };

describe("video blocks", () => {
  it("accept a registry segment and refuse support, claims or a bad segment", () => {
    expect(lessonBlockSchema.parse({ kind: "video", content: video })).toEqual({ kind: "video", content: video });
    expect(() => lessonBlockSchema.parse({ kind: "video", content: video, support: "science", claimIds: [] })).toThrow();
    expect(() => lessonBlockSchema.parse({ kind: "video", content: { ...video, endSeconds: 30 } })).toThrow(/after startSeconds/);
    expect(() => lessonBlockSchema.parse({ kind: "video", content: { ...video, videoId: "short" } })).toThrow(/YouTube video id/);
    expect(() => lessonBlockSchema.parse({ kind: "video", content: { ...video, provider: "vimeo" } })).toThrow();
  });

  it("recognize YouTube-family URLs, and still parse legacy snapshots that hold them", () => {
    for (const url of ["https://www.youtube.com/watch?v=AbCdEfGhIj0", "https://youtu.be/AbCdEfGhIj0", "https://www.youtube-nocookie.com/embed/x", "https://i.ytimg.com/vi/x/0.jpg", "https://M.YOUTUBE.COM/x"]) {
      expect(isVideoHostUrl(url), url).toBe(true);
      // Snapshot parsing stays lenient (a phase-2 version must stay readable); new authoring is
      // refused by validateCatalog and the database, and the player renders such media unavailable.
      expect(mediaAssetSchema.safeParse({ kind: "video", src: url, alt: "x", caption: "", provenanceId: "p1" }).success, url).toBe(true);
    }
    for (const url of ["https://notyoutube.com/x", "https://example.org/youtube.com", "/media/youtube.png"]) expect(isVideoHostUrl(url), url).toBe(false);
  });
});

describe("reserved lesson slugs", () => {
  it("keeps snapshot parsing lenient (a historical lesson named quiz stays readable); authoring refuses it", () => {
    const lesson = { id: "l1", slug: "quiz", title: "x", summary: "", durationMinutes: 5, format: "article", objectives: [], anatomyIds: [], blocks: [], media: [], resources: [] };
    expect(lessonSchema.safeParse(lesson).success).toBe(true);
    expect(RESERVED_LESSON_SLUGS).toContain("quiz");
  });
});

describe("learner RPC rows", () => {
  it("parse a quiz result and module status, and refuse extra or missing fields", () => {
    expect(parseQuizAttemptResult([{ attempt_id: UUID, correct: 4, total: 5, passed: true }])).toEqual({ attemptId: UUID, correct: 4, total: 5, passed: true });
    expect(() => parseQuizAttemptResult([])).toThrow(ContentParseError);
    const status = {
      assignment_id: UUID, version_id: UUID, lessons_total: 2, lessons_completed: 2, quiz_required: true, questions_total: 5,
      best_attempt_id: null, best_correct: null, best_total: null, quiz_passed: true, quiz_credit_attempt_id: UUID, quiz_carried: true, complete: true,
    };
    expect(parseModuleStatus([status])).toMatchObject({ quizCarried: true, complete: true, bestAttemptId: null });
    expect(() => parseModuleStatus([{ ...status, passed: true }])).toThrow(ContentParseError);
  });

  it("parse integrity and media rows", () => {
    expect(parseVersionIntegrity([{ lesson_id: UUID, claim_id: UUID, state: "withdrawn" }])).toEqual([{ lessonId: UUID, claimId: UUID, state: "withdrawn" }]);
    expect(() => parseVersionIntegrity([{ lesson_id: UUID, claim_id: UUID, state: "rejected" }])).toThrow(ContentParseError);
    expect(parseVersionMedia([{ media_id: UUID, state: "disabled", review: null, title: null, channel: null, available: null }])[0]).toMatchObject({ state: "disabled" });
    expect(parseVersionMedia([{ media_id: UUID, state: "playable", review: "model-described", title: null, channel: null, available: null }])[0]!.review).toBe("model-described");
    expect(() => parseVersionMedia([{ media_id: UUID, state: "playable", review: "human-checked", title: null, channel: null, available: null }])).toThrow(ContentParseError);
  });

  it("refuse a client-side verdict in quiz answers", () => {
    expect(quizAnswersSchema.safeParse([{ questionId: "l1:q1", answerIndex: 1 }]).success).toBe(true);
    expect(quizAnswersSchema.safeParse([{ questionId: "l1:q1", answerIndex: 1, passed: true }]).success).toBe(false);
    expect(quizAnswersSchema.safeParse([]).success).toBe(false);
  });
});

describe("review receipt bodies", () => {
  const clean = { verdict: "clean", expectedHash: HASH, claimIds: [], checks: { safety: "pass", originality: "pass" }, findings: [], run };

  it("allow a clean lesson review only with a run, passing checks and nothing above NIT", () => {
    expect(lessonReviewInputSchema.safeParse(clean).success).toBe(true);
    expect(lessonReviewInputSchema.safeParse({ ...clean, run: undefined }).success).toBe(false);
    expect(lessonReviewInputSchema.safeParse({ ...clean, findings: [{ severity: "WARN", item: "x", note: "x" }] }).success).toBe(false);
    expect(lessonReviewInputSchema.safeParse({ ...clean, checks: { safety: "fail", originality: "pass" } }).success).toBe(false);
    expect(lessonReviewInputSchema.safeParse({ ...clean, verdict: "changes_required", run: undefined, findings: [{ severity: "BLOCK", item: "x", note: "x" }] }).success).toBe(true);
  });

  it("apply the same rules to a course review, which has no claim set", () => {
    const { claimIds: _claims, ...course } = clean;
    expect(courseReviewInputSchema.safeParse(course).success).toBe(true);
    expect(courseReviewInputSchema.safeParse(clean).success).toBe(false);
    expect(courseReviewInputSchema.safeParse({ ...course, checks: { safety: "pass", originality: "fail" } }).success).toBe(false);
  });

  it("parse review targets with the course shell", () => {
    const targets = { courseId: UUID, course: { hash: HASH, shell: { title: "x" } }, lessons: [{ lessonId: UUID, hash: HASH, claimIds: [], lesson: {}, blocks: [] }] };
    expect(parseReviewTargets(targets).course.hash).toBe(HASH);
    expect(() => parseReviewTargets({ ...targets, course: undefined })).toThrow(ContentParseError);
  });

  it("need a run for a supported block and a lowercase model id", () => {
    expect(blockReviewInputSchema.safeParse({ verdict: "supported", expectedHash: HASH, claimIds: [UUID], run }).success).toBe(true);
    expect(blockReviewInputSchema.safeParse({ verdict: "supported", expectedHash: HASH, claimIds: [UUID] }).success).toBe(false);
    expect(blockReviewInputSchema.safeParse({ verdict: "supported", expectedHash: HASH, claimIds: [UUID], run: { ...run, model: "GPT 6" } }).success).toBe(false);
  });
});

describe("learner projection (ADR 0007, T21)", () => {
  const quiz = (support: "science" | "practice-based", redacted: boolean) => ({
    kind: "quiz",
    support,
    claimIds: support === "science" ? [UUID] : [],
    content: redacted ? { prompt: "Q?", options: ["A", "B"] } : { prompt: "Q?", options: ["A", "B"], answerIndex: 1, explanation: "B." },
  });
  const course = (blocks: unknown[]) => ({
    id: "c", slug: "c", layer: "base", title: "C", subtitle: "", description: "", level: "foundation", outcomes: [],
    parts: [{ id: "p", ordinal: 1, title: "P", summary: "", lessons: [{ id: "l", slug: "l", title: "L", summary: "", durationMinutes: 5, format: "article", objectives: [], anatomyIds: [], blocks, media: [], resources: [] }] }],
  });

  it("parses a redacted graded quiz and a full practice self-check", () => {
    const parsed = parseLearnerCourse(course([quiz("science", true), quiz("practice-based", false)]));
    expect(parsed.parts[0]!.lessons[0]!.blocks).toHaveLength(2);
  });

  it("keeps practice self-checks and drops graded quizzes for the lesson view", () => {
    const view = lessonViewCourse(parseLearnerCourse(course([quiz("science", true), quiz("practice-based", false), { kind: "heading", content: "H" }])));
    expect(view.parts[0]!.lessons[0]!.blocks.map((b) => [b.kind, "support" in b ? b.support : null])).toEqual([["quiz", "practice-based"], ["heading", null]]);
  });

  it("refuses a graded quiz that still carries its answer key, and the authoring parser refuses a redacted one", () => {
    expect(() => parseLearnerCourse(course([quiz("science", false)]))).toThrow(ContentParseError);
    expect(() => parseCourse(course([quiz("science", true)]))).toThrow(ContentParseError);
  });
});

describe("diagram blocks carry reviewable text (Sol R16)", () => {
  const diagram = {
    kind: "diagram",
    support: "science",
    claimIds: [UUID],
    content: { diagramId: "shoulder.rhythm", alt: "The shoulder blade rotating upward.", caption: "Scapular upward rotation",
      legend: [{ key: "scapula", label: "Shoulder blade", text: "Rotates upward as the arm rises." }] },
  };

  it("parses the reviewable diagram block and still reads a legacy one", () => {
    expect(lessonBlockSchema.parse(diagram)).toEqual(diagram);
    expect(lessonBlockSchema.safeParse({ kind: "diagram", content: { diagramId: "d1", caption: "" } }).success).toBe(true);
  });

  it("refuses a diagram with missing text, loose legend items or no claims for science", () => {
    expect(lessonBlockSchema.safeParse({ ...diagram, content: { ...diagram.content, alt: "" } }).success).toBe(false);
    expect(lessonBlockSchema.safeParse({ ...diagram, content: { ...diagram.content, legend: [{ key: "a b", label: "x", text: "y" }] } }).success).toBe(false);
    expect(lessonBlockSchema.safeParse({ ...diagram, content: { ...diagram.content, legend: [{ key: "a", label: "x", text: "y", colour: "red" }] } }).success).toBe(false);
    expect(lessonBlockSchema.safeParse({ ...diagram, claimIds: [] }).success).toBe(false);
    expect(lessonBlockSchema.safeParse({ ...diagram, support: "practice-based" }).success).toBe(false);
  });
});

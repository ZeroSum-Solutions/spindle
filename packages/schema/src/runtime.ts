// Runtime schemas for content entering Spindle from outside (files, the database,
// API bodies). They check shape only: whether a cited claim is approved and
// relevant is the publish gate's job (validateCatalog and the database receipt).
import { z } from "zod";
import type { Catalog, Course, LearnerCourse, LearnerLessonBlock, Lesson, LessonBlock, MediaAsset, RedactedGradedQuiz, VideoSegment } from "./types";

export class ContentParseError extends Error {
  constructor(
    readonly label: string,
    readonly issues: z.core.$ZodIssue[],
  ) {
    super(`Invalid ${label}: ${issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`);
    this.name = "ContentParseError";
  }
}

export function parseWith<T>(schema: z.ZodType<T>, label: string, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ContentParseError(label, result.error.issues);
  return result.data;
}

const MAX_TEXT = 20_000;
export const idSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/, "must be a plain identifier");
const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a lowercase slug").max(128);
const text = z.string().max(MAX_TEXT);
const requiredText = text.refine((s) => s.trim().length > 0, "must not be blank");

const RELATIVE_PATH = /^\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*$/;
// The host allows no "@", so URLs with credentials fail.
const HOST_LABEL = "[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?";
const HTTPS_URL = new RegExp(`^https://(${HOST_LABEL}(?:\\.${HOST_LABEL})*)(?::(\\d{1,5}))?(?:[/?#].*)?$`);
const UNSAFE_CHARS = /[\s\\\u0000-\u001f\u007f]/;

// WHATWG URL is global in Node and browsers, but the ES lib types do not declare it.
const WhatwgUrl = (globalThis as unknown as { URL: { canParse(input: string): boolean } }).URL;

/** Root-relative paths without dot segments, or https URLs without credentials that a browser can load. */
export function isSafeContentUrl(value: string): boolean {
  if (value.length === 0 || value.length > 2048 || UNSAFE_CHARS.test(value)) return false;
  if (value.startsWith("/")) {
    return RELATIVE_PATH.test(value) && value.split("/").every((seg) => seg !== "." && seg !== "..");
  }
  const match = HTTPS_URL.exec(value);
  if (!match) return false;
  const labels = match[1]!.split(".");
  const port = match[2] === undefined ? 443 : Number(match[2]);
  // The database's link rule, independent of the runtime's URL parser (whose IDNA handling
  // differs between Node releases): an alphabetic top-level label and no punycode labels.
  if (!/^[A-Za-z]{2,63}$/.test(labels.at(-1)!) || labels.some((label) => /^xn--/i.test(label))) return false;
  return port >= 1 && port <= 65535 && WhatwgUrl.canParse(value);
}

const safeUrl = z.string().refine(isSafeContentUrl, "must be a root-relative path or an https URL");

const VIDEO_HOST = /^https:\/\/(?:[a-z0-9-]+\.)*(?:youtube\.com|youtu\.be|youtube-nocookie\.com|ytimg\.com|googlevideo\.com)(?::\d+)?(?:[/?#]|$)/i;

/** A YouTube-family URL. Never a claim source or plain media: videos come from the practice-media registry (ADR 0007). */
export function isVideoHostUrl(value: string): boolean {
  return VIDEO_HOST.test(value);
}

export const mediaAssetSchema = z.strictObject({
  kind: z.enum(["image", "video", "diagram"]),
  // Lenient on purpose: phase-2 snapshots may hold video-host URLs and must stay readable. New content is
  // refused by validateCatalog and the database; the player renders such media as unavailable.
  src: safeUrl,
  alt: requiredText,
  caption: text,
  provenanceId: idSchema,
}) satisfies z.ZodType<MediaAsset>;

export const videoSegmentSchema = z
  .strictObject({
    mediaId: idSchema,
    provider: z.literal("youtube"),
    videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/, "must be a YouTube video id"),
    startSeconds: z.number().int().min(0).max(86_399),
    endSeconds: z.number().int().min(1).max(86_400),
    rationale: requiredText.max(1000),
    caption: text.max(1000),
  })
  .refine((v) => v.endSeconds > v.startSeconds, { message: "must be after startSeconds", path: ["endSeconds"] }) satisfies z.ZodType<VideoSegment>;

/** Shape of an evidence binding. Approval is checked later, against claim records. */
const supported = {
  support: z.enum(["science", "practice-based"]),
  claimIds: z.array(idSchema).max(50),
};

const blockVariants = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("heading"), content: requiredText }),
  z.strictObject({ kind: z.literal("paragraph"), content: requiredText, ...supported }),
  z.strictObject({
    kind: z.literal("callout"),
    content: z.strictObject({ label: requiredText, text: requiredText }),
    ...supported,
  }),
  z.strictObject({ kind: z.literal("image"), content: mediaAssetSchema }),
  z.strictObject({ kind: z.literal("checklist"), content: z.array(requiredText).min(1).max(100), ...supported }),
  z.strictObject({
    kind: z.literal("quiz"),
    content: z
      .strictObject({
        prompt: requiredText,
        options: z.array(requiredText).min(2).max(10),
        answerIndex: z.number().int().nonnegative(),
        explanation: requiredText,
      })
      .refine((q) => q.answerIndex < q.options.length, { message: "answer is outside the options", path: ["answerIndex"] }),
    ...supported,
  }),
  z.strictObject({ kind: z.literal("video"), content: videoSegmentSchema }),
]);

/** Legacy diagram block (before R16): parses so historical snapshots stay readable; validateCatalog refuses it. */
const legacyDiagramSchema = z.strictObject({ kind: z.literal("diagram"), content: z.strictObject({ diagramId: idSchema, caption: text }) });

/** The reviewable diagram block (R16): alt, caption and legend text live in the lesson and are hashed and reviewed. */
const diagramSchema = z.strictObject({
  kind: z.literal("diagram"),
  content: z.strictObject({
    diagramId: idSchema,
    alt: requiredText.max(500),
    caption: text.max(1000),
    legend: z.array(z.strictObject({ key: idSchema, label: requiredText.max(100), text: text.max(1000) })).max(20),
  }),
  ...supported,
});

export const lessonBlockSchema = z.union([blockVariants, diagramSchema, legacyDiagramSchema]).superRefine((block, ctx) => {
  if (!("support" in block)) return;
  const { support, claimIds } = block;
  if (new Set(claimIds).size !== claimIds.length) {
    ctx.addIssue({ code: "custom", path: ["claimIds"], message: "has duplicate claim ids" });
  }
  if (support === "science" && claimIds.length === 0) {
    ctx.addIssue({ code: "custom", path: ["claimIds"], message: "science blocks must bind at least one claim" });
  }
  if (support === "practice-based" && claimIds.length > 0) {
    ctx.addIssue({ code: "custom", path: ["claimIds"], message: "practice-based blocks must not bind claims" });
  }
}) satisfies z.ZodType<LessonBlock>;

/**
 * Lesson slugs that collide with player routes (the module quiz page). New authoring refuses them
 * (validateCatalog and the database); snapshot parsing stays lenient so historical versions stay readable.
 */
export const RESERVED_LESSON_SLUGS: readonly string[] = ["quiz"];

function lessonSchemaFor<B extends z.ZodType>(block: B) {
  return z.strictObject({
    id: idSchema,
    slug: slugSchema,
    title: requiredText,
    summary: text,
    durationMinutes: z.number().int().min(0).max(600),
    format: z.enum(["article", "video", "diagram", "practice", "quiz"]),
    objectives: z.array(requiredText).max(50),
    anatomyIds: z.array(z.string().regex(/^UBERON:\d{7}$/, "must be an Uberon id")).max(50),
    blocks: z.array(block).max(500),
    media: z.array(mediaAssetSchema).max(100),
    resources: z
      .array(
        z.strictObject({
          label: requiredText,
          href: safeUrl,
          type: z.enum(["worksheet", "reference", "transcript"]),
        }),
      )
      .max(50),
  });
}

function courseSchemaFor<L extends z.ZodType>(lesson: L) {
  return z.strictObject({
    id: idSchema,
    slug: slugSchema,
    layer: z.enum(["base", "modality", "method"]),
    title: requiredText,
    subtitle: text,
    description: text,
    level: z.enum(["foundation", "intermediate", "advanced"]),
    outcomes: z.array(requiredText).max(50),
    parts: z
      .array(
        z.strictObject({
          id: idSchema,
          ordinal: z.number().int().min(1),
          title: requiredText,
          summary: text,
          lessons: z.array(lesson).max(200),
        }),
      )
      .max(100),
  });
}

export const lessonSchema = lessonSchemaFor(lessonBlockSchema) satisfies z.ZodType<Lesson>;
export const courseSchema = courseSchemaFor(lessonSchema) satisfies z.ZodType<Course>;

/** A graded quiz as learners receive it (learner_snapshot): prompt and options, no answer key or explanation. */
const redactedQuizSchema = z.strictObject({
  kind: z.literal("quiz"),
  content: z.strictObject({ prompt: requiredText, options: z.array(requiredText).min(2).max(10) }),
  support: z.literal("science"),
  claimIds: z.array(idSchema).min(1).max(50),
}) satisfies z.ZodType<RedactedGradedQuiz>;

/**
 * Blocks in a learner projection. A graded quiz must arrive redacted: one that still carries its answer
 * key is refused, so a leak through a wrong read path fails loudly instead of rendering the key.
 */
export const learnerBlockSchema = z.union([
  lessonBlockSchema.refine((b) => !(b.kind === "quiz" && b.support === "science"), "a graded quiz must arrive without its answer key"),
  redactedQuizSchema,
]) satisfies z.ZodType<LearnerLessonBlock>;

export const learnerCourseSchema = courseSchemaFor(lessonSchemaFor(learnerBlockSchema)) satisfies z.ZodType<LearnerCourse>;

export const catalogSchema = z.strictObject({
  version: requiredText,
  courses: z.array(courseSchema).max(1000),
}) satisfies z.ZodType<Catalog>;

/** Shape-checks a catalog. Run validateCatalog afterwards for ids, provenance and claim approval. */
export const parseCatalog = (value: unknown): Catalog => parseWith(catalogSchema, "catalog", value);
export const parseCourse = (value: unknown): Course => parseWith(courseSchema, "course", value);
/** Parses curriculum_versions.learner_snapshot, the only snapshot learners can read (ADR 0007). */
export const parseLearnerCourse = (value: unknown): LearnerCourse => parseWith(learnerCourseSchema, "learner course", value);

/**
 * The course as the lesson pages render it: graded (science) quizzes are removed, because they belong to
 * the module quiz page and arrive without an answer key. Practice self-checks stay. The result is a plain
 * Course, so lesson rendering needs no knowledge of redaction.
 */
export function lessonViewCourse(course: LearnerCourse): Course {
  return {
    ...course,
    parts: course.parts.map((part) => ({
      ...part,
      lessons: part.lessons.map((lesson) => ({
        ...lesson,
        blocks: lesson.blocks.filter((b): b is LessonBlock => !(b.kind === "quiz" && b.support === "science")),
      })),
    })),
  };
}

const STORED_CONTENT = /^\/media\/content\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*$/;
const STORED_ORG = /^\/media\/org\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*$/;

/**
 * Whose stored file a media src is (P18-06): global media under /media/content/, or one gym's under
 * /media/org/<gym id>/. Null for anything else (external URLs, other site paths, dot segments).
 * The database applies the same rule to new authoring and at publish.
 */
export function storedMediaOwner(src: string): { area: "content" } | { area: "org"; orgId: string } | null {
  if (src.split("/").some((seg) => seg === "." || seg === "..")) return null;
  if (STORED_CONTENT.test(src)) return { area: "content" };
  const m = STORED_ORG.exec(src);
  return m ? { area: "org", orgId: m[1]! } : null;
}

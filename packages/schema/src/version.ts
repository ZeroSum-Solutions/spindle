// Version contracts. A published curriculum version is an immutable whole tree;
// these are the per-lesson facts the credit engine needs from it. Content
// hashes come from the database and are compared for equality only.
import { z } from "zod";
import { idSchema, parseWith } from "./runtime";

export interface LessonFingerprint {
  lessonId: string;
  /** Opaque content hash computed by the database for this lesson in this version. */
  contentHash: string;
}

export interface VersionManifest {
  versionId: string;
  lessons: LessonFingerprint[];
}

/** One row of a learner's lesson completions (mirrors `lesson_completions`). */
export interface LessonCompletion {
  id: string;
  lessonId: string;
  versionId: string;
  contentHash: string;
  /** ISO 8601 with seconds and an offset, at most microsecond precision (PostgreSQL timestamptz). */
  completedAt: string;
  /** Null for a direct completion; for carried credit, the root completion (never a chain). */
  originCompletionId: string | null;
}

/** sha256 hex as computed by the database. Never recomputed in TypeScript. */
const hashSchema = z.string().regex(/^[0-9a-f]{64}$/, "must be a lowercase sha256 hex digest");

export const versionManifestSchema = z
  .strictObject({
    versionId: idSchema,
    lessons: z.array(z.strictObject({ lessonId: idSchema, contentHash: hashSchema })).max(5000),
  })
  .superRefine((manifest, ctx) => {
    const seen = new Set<string>();
    manifest.lessons.forEach(({ lessonId }, index) => {
      if (seen.has(lessonId)) {
        ctx.addIssue({ code: "custom", path: ["lessons", index, "lessonId"], message: `Duplicate lesson ${lessonId}` });
      }
      seen.add(lessonId);
    });
  }) satisfies z.ZodType<VersionManifest>;

export const lessonCompletionSchema = z.strictObject({
  id: idSchema,
  lessonId: idSchema,
  versionId: idSchema,
  contentHash: hashSchema,
  completedAt: z.iso
    .datetime({ offset: true })
    .regex(/:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/, "must have at most microsecond precision, like PostgreSQL"),
  originCompletionId: idSchema.nullable(),
}) satisfies z.ZodType<LessonCompletion>;

export const parseVersionManifest = (value: unknown): VersionManifest =>
  parseWith(versionManifestSchema, "version manifest", value);
export const parseLessonCompletions = (value: unknown): LessonCompletion[] =>
  parseWith(z.array(lessonCompletionSchema).max(10_000), "lesson completions", value);

// Runtime schemas for content entering Spindle from outside (files, the database,
// API bodies). They check shape only: whether a cited claim is approved and
// relevant is the publish gate's job (validateCatalog and the database receipt).
import { z } from "zod";
import type { Catalog, Course, Lesson, LessonBlock, MediaAsset } from "./types";

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
const HTTPS_URL = new RegExp(`^https://${HOST_LABEL}(?:\\.${HOST_LABEL})*(?::(\\d{1,5}))?(?:[/?#].*)?$`);
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
  const port = match[1] === undefined ? 443 : Number(match[1]);
  // The shape check alone accepts ports out of range and hosts the URL parser rejects (1.2.3.999, xn--zz.org).
  return port >= 1 && port <= 65535 && WhatwgUrl.canParse(value);
}

const safeUrl = z.string().refine(isSafeContentUrl, "must be a root-relative path or an https URL");

export const mediaAssetSchema = z.strictObject({
  kind: z.enum(["image", "video", "diagram"]),
  src: safeUrl,
  alt: requiredText,
  caption: text,
  provenanceId: idSchema,
}) satisfies z.ZodType<MediaAsset>;

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
  z.strictObject({ kind: z.literal("diagram"), content: z.strictObject({ diagramId: idSchema, caption: text }) }),
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
]);

export const lessonBlockSchema = blockVariants.superRefine((block, ctx) => {
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

export const lessonSchema = z.strictObject({
  id: idSchema,
  slug: slugSchema,
  title: requiredText,
  summary: text,
  durationMinutes: z.number().int().min(0).max(600),
  format: z.enum(["article", "video", "diagram", "practice", "quiz"]),
  objectives: z.array(requiredText).max(50),
  anatomyIds: z.array(z.string().regex(/^UBERON:\d{7}$/, "must be an Uberon id")).max(50),
  blocks: z.array(lessonBlockSchema).max(500),
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
}) satisfies z.ZodType<Lesson>;

export const courseSchema = z.strictObject({
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
        lessons: z.array(lessonSchema).max(200),
      }),
    )
    .max(100),
}) satisfies z.ZodType<Course>;

export const catalogSchema = z.strictObject({
  version: requiredText,
  courses: z.array(courseSchema).max(1000),
}) satisfies z.ZodType<Catalog>;

/** Shape-checks a catalog. Run validateCatalog afterwards for ids, provenance and claim approval. */
export const parseCatalog = (value: unknown): Catalog => parseWith(catalogSchema, "catalog", value);
export const parseCourse = (value: unknown): Course => parseWith(courseSchema, "course", value);

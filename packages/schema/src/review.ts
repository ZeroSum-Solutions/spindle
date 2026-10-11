// Review receipt contracts for the publisher RPCs (ADR 0007). The trusted
// recorder builds a packet from publisher_review_targets, a model reviews it,
// and the recorder sends back the verdict with the exact hash and claim set
// the model saw. The database refuses a stale or incomplete receipt.
import { z } from "zod";
import { idSchema, parseWith } from "./runtime";

const hash = z.string().regex(/^[0-9a-f]{64}$/, "must be a lowercase sha256 hex digest");
const isoTime = z.iso.datetime({ offset: true });

/** The model and session that produced a review. Stored apart from the publisher who records it. */
export interface ReviewRun {
  model: string;
  session: string;
  /** sha256 of the exact packet the model received. */
  packetDigest: string;
  reviewedAt: string;
}

export const reviewRunSchema = z.strictObject({
  model: z.string().regex(/^[a-z0-9][a-z0-9._:-]{0,99}$/, "must be a lowercase model id"),
  session: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/, "must be a plain identifier"),
  packetDigest: hash,
  reviewedAt: isoTime,
}) satisfies z.ZodType<ReviewRun>;

export type FindingSeverity = "BLOCK" | "WARN" | "NIT";

export interface LessonReviewFinding {
  severity: FindingSeverity;
  item: string;
  note: string;
}

/** Body of publisher_review_lesson. "clean" needs a run, both checks passing and no BLOCK or WARN finding. */
export interface LessonReviewInput {
  verdict: "clean" | "changes_required";
  expectedHash: string;
  claimIds: string[];
  checks: { safety: "pass" | "fail"; originality: "pass" | "fail" };
  findings: LessonReviewFinding[];
  notes?: string;
  run?: ReviewRun;
}

export const lessonReviewInputSchema = z
  .strictObject({
    verdict: z.enum(["clean", "changes_required"]),
    expectedHash: hash,
    claimIds: z.array(idSchema).max(1000),
    checks: z.strictObject({ safety: z.enum(["pass", "fail"]), originality: z.enum(["pass", "fail"]) }),
    findings: z
      .array(z.strictObject({ severity: z.enum(["BLOCK", "WARN", "NIT"]), item: z.string().min(1).max(200), note: z.string().min(1).max(2000) }))
      .max(200),
    notes: z.string().max(2000).optional(),
    run: reviewRunSchema.optional(),
  })
  .superRefine((r, ctx) => {
    if (r.verdict !== "clean") return;
    if (r.findings.some((f) => f.severity !== "NIT")) ctx.addIssue({ code: "custom", path: ["verdict"], message: "a clean review has no BLOCK or WARN finding" });
    if (r.checks.safety !== "pass" || r.checks.originality !== "pass") {
      ctx.addIssue({ code: "custom", path: ["verdict"], message: "a clean review passes the safety and originality checks" });
    }
    if (!r.run) ctx.addIssue({ code: "custom", path: ["run"], message: "a clean review needs a model run receipt" });
  }) satisfies z.ZodType<LessonReviewInput>;

/** Body of publisher_review_block. "supported" needs a run. */
export interface BlockReviewInput {
  verdict: "supported" | "unsupported";
  expectedHash: string;
  claimIds: string[];
  notes?: string;
  run?: ReviewRun;
}

export const blockReviewInputSchema = z
  .strictObject({
    verdict: z.enum(["supported", "unsupported"]),
    expectedHash: hash,
    claimIds: z.array(idSchema).min(1).max(50),
    notes: z.string().max(2000).optional(),
    run: reviewRunSchema.optional(),
  })
  .refine((r) => r.verdict !== "supported" || r.run !== undefined, { message: "a supported verdict needs a model run receipt", path: ["run"] }) satisfies z.ZodType<BlockReviewInput>;

/** One lesson in publisher_review_targets: the snapshot JSON to review and the values to send back. */
export interface LessonReviewTarget {
  lessonId: string;
  hash: string;
  claimIds: string[];
  lesson: unknown;
  blocks: { blockId: string; ordinal: number; kind: string; support: "science" | "practice-based" | null; hash: string; claimIds: string[] }[];
}

export interface ReviewTargets {
  courseId: string;
  lessons: LessonReviewTarget[];
}

export const reviewTargetsSchema = z.strictObject({
  courseId: idSchema,
  lessons: z.array(
    z.strictObject({
      lessonId: idSchema,
      hash,
      claimIds: z.array(idSchema),
      lesson: z.unknown(),
      blocks: z.array(
        z.strictObject({
          blockId: idSchema,
          ordinal: z.number().int().min(1),
          kind: z.string(),
          support: z.enum(["science", "practice-based"]).nullable(),
          hash,
          claimIds: z.array(idSchema),
        }),
      ),
    }),
  ),
}) satisfies z.ZodType<ReviewTargets>;

export const parseReviewTargets = (value: unknown): ReviewTargets => parseWith(reviewTargetsSchema, "review targets", value);

// Graded quiz, module status and learner-visible integrity contracts (ADR 0007).
// The database scores attempts and works out completion; these schemas parse
// what its learner RPCs return, so the app never trusts an unchecked row.
import { z } from "zod";
import { idSchema, parseWith } from "./runtime";

/** A pass needs at least this percentage of the graded questions. */
export const PASS_PERCENT = 80;

/** One answer the client sends to submit_quiz_attempt. The client never sends a score or "passed". */
export interface QuizAnswer {
  /** '<lesson id>:q<n>': the n-th science quiz block in that lesson, counted from 1. */
  questionId: string;
  answerIndex: number;
}

export const quizAnswersSchema = z
  .array(z.strictObject({ questionId: z.string().min(1).max(200), answerIndex: z.number().int().min(0).max(9) }))
  .min(1)
  .max(1000) satisfies z.ZodType<QuizAnswer[]>;

/** What submit_quiz_attempt returns. */
export interface QuizAttemptResult {
  attemptId: string;
  correct: number;
  total: number;
  passed: boolean;
}

const count = z.number().int().min(0);

export const quizAttemptResultSchema = z
  .strictObject({ attempt_id: idSchema, correct: count, total: count.min(1), passed: z.boolean() })
  .transform((r): QuizAttemptResult => ({ attemptId: r.attempt_id, correct: r.correct, total: r.total, passed: r.passed }));

/** One row of the post-pass answer review (quiz_attempt_review): only the attempt's own learner, only after a pass. */
export interface QuizReviewRow {
  questionId: string;
  chosen: number;
  answerIndex: number;
  correct: boolean;
  explanation: string;
}

export const quizReviewRowSchema = z
  .strictObject({ question_id: z.string().min(1).max(200), chosen: count, answer_index: count, correct: z.boolean(), explanation: z.string().max(5000) })
  .transform((r): QuizReviewRow => ({ questionId: r.question_id, chosen: r.chosen, answerIndex: r.answer_index, correct: r.correct, explanation: r.explanation }));

/** Module completion as the server works it out (module_status). */
export interface ModuleStatus {
  assignmentId: string;
  versionId: string;
  lessonsTotal: number;
  lessonsCompleted: number;
  /** False for versions published before phase 3 and for courses without graded questions. */
  quizRequired: boolean;
  questionsTotal: number;
  bestAttemptId: string | null;
  bestCorrect: number | null;
  bestTotal: number | null;
  quizPassed: boolean;
  /** The passing attempt that counts: the learner's own here, or one carried from another version. */
  quizCreditAttemptId: string | null;
  quizCarried: boolean;
  complete: boolean;
}

export const moduleStatusSchema = z
  .strictObject({
    assignment_id: idSchema,
    version_id: idSchema,
    lessons_total: count,
    lessons_completed: count,
    quiz_required: z.boolean(),
    questions_total: count,
    best_attempt_id: idSchema.nullable(),
    best_correct: count.nullable(),
    best_total: count.nullable(),
    quiz_passed: z.boolean(),
    quiz_credit_attempt_id: idSchema.nullable(),
    quiz_carried: z.boolean(),
    complete: z.boolean(),
  })
  .transform(
    (r): ModuleStatus => ({
      assignmentId: r.assignment_id,
      versionId: r.version_id,
      lessonsTotal: r.lessons_total,
      lessonsCompleted: r.lessons_completed,
      quizRequired: r.quiz_required,
      questionsTotal: r.questions_total,
      bestAttemptId: r.best_attempt_id,
      bestCorrect: r.best_correct,
      bestTotal: r.best_total,
      quizPassed: r.quiz_passed,
      quizCreditAttemptId: r.quiz_credit_attempt_id,
      quizCarried: r.quiz_carried,
      complete: r.complete,
    }),
  );

/**
 * The evidence state of a cited claim, as a learner may see it. "withdrawn" (rejected
 * after approval) removes the Science presentation; "recheck_due" (approval expired)
 * and "retracted" show a notice.
 */
export type ClaimIntegrityState = "current" | "recheck_due" | "withdrawn" | "retracted";

export interface ClaimIntegrity {
  lessonId: string;
  claimId: string;
  state: ClaimIntegrityState;
}

export const claimIntegritySchema = z
  .strictObject({ lesson_id: idSchema, claim_id: idSchema, state: z.enum(["current", "recheck_due", "withdrawn", "retracted"]) })
  .transform((r): ClaimIntegrity => ({ lessonId: r.lesson_id, claimId: r.claim_id, state: r.state }));

/**
 * Playback state of a registry clip in a version (version_media). Provider fields are null unless fresh.
 * `review` is "model-described" for a playable clip (D-11): a model described the segment and Sol reviewed
 * that description. No human has checked it yet, so the player must never claim one did.
 */
export interface MediaAvailability {
  mediaId: string;
  state: "playable" | "disabled";
  review: "model-described" | null;
  title: string | null;
  channel: string | null;
  available: boolean | null;
}

export const mediaAvailabilitySchema = z
  .strictObject({
    media_id: idSchema,
    state: z.enum(["playable", "disabled"]),
    review: z.literal("model-described").nullable(),
    title: z.string().max(500).nullable(),
    channel: z.string().max(200).nullable(),
    available: z.boolean().nullable(),
  })
  .transform((r): MediaAvailability => ({ mediaId: r.media_id, state: r.state, review: r.review, title: r.title, channel: r.channel, available: r.available }));

export const parseQuizReview = (value: unknown): QuizReviewRow[] => parseWith(z.array(quizReviewRowSchema).min(1).max(1000), "quiz review", value);
export const parseQuizAttemptResult = (value: unknown): QuizAttemptResult => {
  const rows = parseWith(z.array(quizAttemptResultSchema).length(1), "quiz attempt result", value);
  return rows[0]!;
};
export const parseModuleStatus = (value: unknown): ModuleStatus => {
  const rows = parseWith(z.array(moduleStatusSchema).length(1), "module status", value);
  return rows[0]!;
};
export const parseVersionIntegrity = (value: unknown): ClaimIntegrity[] =>
  parseWith(z.array(claimIntegritySchema).max(10_000), "version integrity", value);
export const parseVersionMedia = (value: unknown): MediaAvailability[] =>
  parseWith(z.array(mediaAvailabilitySchema).max(1000), "version media", value);

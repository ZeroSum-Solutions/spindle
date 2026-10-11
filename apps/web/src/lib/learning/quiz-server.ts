import "server-only";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { parseModuleStatus, parseQuizAttemptResult, parseQuizReview, type ModuleStatus, type QuizReviewRow } from "@spindle/schema";
import { learnerQuestions } from "@spindle/engine";
import { slugSchema } from "@/lib/forms";
import { learnerGym, myAssignment, type LearnerGym } from "./load";
import { classifySubmitError, readSubmission, resultState, UNCONFIRMED, type QuizState } from "./quiz";

const routeSchema = z.object({ gym: slugSchema, assignmentId: z.uuid() });

/** The rendered quiz's assignment. Comes only from server-held route context, never from a form. */
export type QuizRoute = z.input<typeof routeSchema>;

const NOT_SUBMITTED: QuizState = { status: "error", kind: "rejected", message: "We could not submit your answers. Nothing was saved. Try again." };

/**
 * Submits a graded attempt for the route's assignment. Like lesson completion, the
 * quiz page wraps this in an inline action that closes over the route, so the form
 * carries only the attempt key and the answers. The gym is re-bound by slug through
 * RLS and the assignment to that gym and the caller; the database scores the answers
 * against the assigned immutable version and decides "passed".
 */
export async function submitQuiz(route: QuizRoute, form: FormData): Promise<QuizState> {
  const parsed = routeSchema.safeParse(route);
  if (!parsed.success) return { status: "error", kind: "rejected", message: "This quiz is no longer available here. Nothing was saved. Reload the page." };
  // Once the RPC has been called the attempt may be stored, so later failures are "unconfirmed",
  // never "nothing was saved".
  let submitted = false;
  try {
    const ctx = await learnerGym(parsed.data.gym);
    const detail = await myAssignment(ctx, parsed.data.assignmentId);
    if (!detail.available) return { status: "error", kind: "rejected", message: "This course version can't be displayed, so its quiz can't be submitted. Nothing was saved." };
    // Only phase-3 versions have a graded quiz; submit_quiz_attempt refuses the rest.
    // From the learner projection: prompts and options only, no answer key (T21, Sol R1 PR22-01).
    const questions = detail.version.gradedQuiz ? learnerQuestions(detail.version.learnerCourse) : [];
    if (questions.length === 0) return { status: "error", kind: "rejected", message: "This course version has no graded quiz. Nothing was saved." };
    const read = readSubmission(form, questions);
    if ("error" in read) return { status: "error", kind: "rejected", message: read.error };

    submitted = true;
    const { data, error } = await ctx.supabase.rpc("submit_quiz_attempt", {
      p_assignment: detail.assignmentId,
      p_attempt_key: read.attemptKey,
      // Plain objects: the generated Json type does not accept the QuizAnswer interface.
      p_answers: read.answers.map(({ questionId, answerIndex }) => ({ questionId, answerIndex })),
    });
    if (error) return classifySubmitError(error);
    const result = parseQuizAttemptResult(data);
    try {
      revalidatePath(`/gyms/${parsed.data.gym}/learn`, "layout");
    } catch {
      // The attempt is saved; a stale cache only delays the status card.
    }
    // Answers and explanations come only from the server, and only after a pass.
    const review = result.passed ? await loadReview(ctx, result.attemptId) : null;
    return resultState(result, review);
  } catch (err) {
    unstable_rethrow(err);
    return submitted ? UNCONFIRMED : NOT_SUBMITTED;
  }
}

/** The post-pass answer review for my own attempt, or null when it cannot be read (the score still stands). */
async function loadReview(ctx: LearnerGym, attemptId: string): Promise<QuizReviewRow[] | null> {
  try {
    const { data, error } = await ctx.supabase.rpc("quiz_attempt_review", { p_attempt: attemptId });
    if (error) return null;
    return parseQuizReview(data);
  } catch {
    return null;
  }
}

/** The server's module status for one of my assignments, or null when it cannot be read (shown as unavailable, never as zero). */
export async function loadModuleStatus(ctx: LearnerGym, assignmentId: string): Promise<ModuleStatus | null> {
  const { data, error } = await ctx.supabase.rpc("module_status", { p_assignment: assignmentId });
  if (error) return null;
  try {
    return parseModuleStatus(data);
  } catch {
    return null;
  }
}

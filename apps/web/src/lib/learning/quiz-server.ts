import "server-only";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { parseModuleStatus, parseQuizAttemptResult, type ModuleStatus } from "@spindle/schema";
import { gradedQuestions } from "@spindle/engine";
import { slugSchema } from "@/lib/forms";
import { learnerGym, myAssignment, type LearnerGym } from "./load";
import { readSubmission, resultState, submitErrorMessage, type QuizState } from "./quiz";

const routeSchema = z.object({ gym: slugSchema, assignmentId: z.uuid() });

/** The rendered quiz's assignment. Comes only from server-held route context, never from a form. */
export type QuizRoute = z.input<typeof routeSchema>;

const NOT_SUBMITTED: QuizState = { status: "error", message: "We could not submit your answers. Nothing was saved. Try again." };

/**
 * Submits a graded attempt for the route's assignment. Like lesson completion, the
 * quiz page wraps this in an inline action that closes over the route, so the form
 * carries only the attempt key and the answers. The gym is re-bound by slug through
 * RLS and the assignment to that gym and the caller; the database scores the answers
 * against the assigned immutable version and decides "passed".
 */
export async function submitQuiz(route: QuizRoute, form: FormData): Promise<QuizState> {
  const parsed = routeSchema.safeParse(route);
  if (!parsed.success) return { status: "error", message: "This quiz is no longer available here. Reload the page." };
  try {
    const ctx = await learnerGym(parsed.data.gym);
    const detail = await myAssignment(ctx, parsed.data.assignmentId);
    if (!detail.available) return { status: "error", message: "This course version can't be displayed, so its quiz can't be submitted." };
    const questions = gradedQuestions(detail.version.course);
    if (questions.length === 0) return { status: "error", message: "This course version has no graded quiz." };
    const read = readSubmission(form, questions);
    if ("error" in read) return { status: "error", message: read.error };

    const { data, error } = await ctx.supabase.rpc("submit_quiz_attempt", {
      p_assignment: detail.assignmentId,
      p_attempt_key: read.attemptKey,
      // Plain objects: the generated Json type does not accept the QuizAnswer interface.
      p_answers: read.answers.map(({ questionId, answerIndex }) => ({ questionId, answerIndex })),
    });
    if (error) return { status: "error", message: submitErrorMessage(error) };
    const result = parseQuizAttemptResult(data);
    revalidatePath(`/gyms/${parsed.data.gym}/learn`, "layout");
    return resultState(result, questions, read.answers);
  } catch (err) {
    unstable_rethrow(err);
    return NOT_SUBMITTED;
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

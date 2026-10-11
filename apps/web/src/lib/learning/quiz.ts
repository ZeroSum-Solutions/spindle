import { z } from "zod";
import { PASS_PERCENT, quizAnswersSchema, type ModuleStatus, type QuizAnswer, type QuizAttemptResult } from "@spindle/schema";
import { scoreAttempt, type GradedQuestion } from "@spindle/engine";

// Graded module quiz, app side (ADR 0007). The database scores every attempt and works
// out completion; this module only reads the form, maps errors to plain words, and
// explains a result the server already decided. It never decides "passed" itself.

/** What the learner sees of a question before submitting: no answer key, no explanation. */
export interface QuizQuestionView {
  questionId: string;
  lessonTitle: string;
  prompt: string;
  options: string[];
}

export function questionViews(questions: readonly GradedQuestion[], lessonTitles: ReadonlyMap<string, string>): QuizQuestionView[] {
  return questions.map((q) => ({ questionId: q.questionId, lessonTitle: lessonTitles.get(q.lessonId) ?? "", prompt: q.prompt, options: [...q.options] }));
}

/** Form field name for a question's radio group. */
export const fieldName = (questionId: string) => `q:${questionId}`;

export type QuizState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "result";
      attemptId: string;
      correct: number;
      total: number;
      passed: boolean;
      /** Per-question feedback, or null when the app's explanation does not match the server's score. */
      feedback: { questionId: string; correct: boolean; explanation: string }[] | null;
    };

const submissionSchema = z.strictObject({ attemptKey: z.uuid(), answers: quizAnswersSchema });

export const MISSING_ANSWERS = "Answer every question before you submit.";

/** Reads one answer per graded question from the form. Anything missing, extra or malformed is refused. */
export function readSubmission(form: FormData, questions: readonly GradedQuestion[]): { attemptKey: string; answers: QuizAnswer[] } | { error: string } {
  const answers: QuizAnswer[] = [];
  for (const q of questions) {
    const raw = form.get(fieldName(q.questionId));
    if (typeof raw !== "string" || !/^\d{1,2}$/.test(raw)) return { error: MISSING_ANSWERS };
    const answerIndex = Number(raw);
    if (answerIndex >= q.options.length) return { error: MISSING_ANSWERS };
    answers.push({ questionId: q.questionId, answerIndex });
  }
  const parsed = submissionSchema.safeParse({ attemptKey: form.get("attemptKey"), answers });
  if (!parsed.success) return { error: "We could not read your answers. Reload the page and try again." };
  return parsed.data;
}

/** Plain words for submit_quiz_attempt failures. Nothing is saved in any of these cases. */
export function submitErrorMessage(error: { code?: string; message?: string } | null): string {
  switch (error?.code) {
    case "22023":
      return error.message?.includes("attemptKey")
        ? "That attempt was already submitted with different answers. Start a new attempt."
        : "Your answers did not match this quiz. Reload the page and try again.";
    case "P0002":
      return "This course is no longer assigned to you here. Reload the page.";
    case "P0001":
      return "This course version has no graded quiz.";
    default:
      return "We could not submit your answers. Nothing was saved. Try again.";
  }
}

/**
 * The server's result, with per-question feedback from the engine. The server's
 * numbers always win: if the engine's count disagrees, feedback is withheld rather
 * than shown next to a score it does not explain.
 */
export function resultState(result: QuizAttemptResult, questions: readonly GradedQuestion[], answers: readonly QuizAnswer[]): Extract<QuizState, { status: "result" }> {
  let feedback: Extract<QuizState, { status: "result" }>["feedback"] = null;
  try {
    const scored = scoreAttempt(questions, answers);
    if (scored.correct === result.correct && scored.total === result.total) {
      const byId = new Map(questions.map((q) => [q.questionId, q]));
      feedback = scored.results.map((r) => ({ questionId: r.questionId, correct: r.correct, explanation: byId.get(r.questionId)!.explanation }));
    }
  } catch {
    feedback = null;
  }
  return { status: "result", attemptId: result.attemptId, correct: result.correct, total: result.total, passed: result.passed, feedback };
}

/** Fewest correct answers that pass, for a quiz of `total` questions. */
export function neededToPass(total: number): number {
  return Math.ceil((total * PASS_PERCENT) / 100);
}

export interface ModuleStatusView {
  complete: boolean;
  headline: string;
  lessons: string;
  quiz: string;
  /** Whether to offer the quiz: it applies and has not been passed yet. */
  offerQuiz: boolean;
}

/** Literal text for the module status the server reported. */
export function moduleStatusView(s: ModuleStatus): ModuleStatusView {
  const lessons = `${s.lessonsCompleted} of ${s.lessonsTotal} ${s.lessonsTotal === 1 ? "lesson" : "lessons"} done.`;
  let quiz: string;
  if (!s.quizRequired) quiz = "This version has no graded quiz.";
  else if (s.quizPassed && s.quizCarried) quiz = "Quiz passed: credit carried from another version with the same questions.";
  else if (s.quizPassed) quiz = `Quiz passed: your best attempt was ${s.bestCorrect} of ${s.bestTotal}.`;
  else if (s.bestAttemptId !== null && s.bestCorrect !== null && s.bestTotal !== null)
    quiz = `Quiz not passed yet: your best attempt was ${s.bestCorrect} of ${s.bestTotal}. You need ${neededToPass(s.bestTotal)} to pass.`;
  else quiz = `Quiz not taken yet: ${s.questionsTotal} ${s.questionsTotal === 1 ? "question" : "questions"}, ${neededToPass(s.questionsTotal)} correct to pass.`;
  return {
    complete: s.complete,
    headline: s.complete ? "Module complete." : "Module not complete yet.",
    lessons,
    quiz,
    offerQuiz: s.quizRequired && !s.quizPassed,
  };
}

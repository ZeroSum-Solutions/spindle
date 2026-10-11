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
  /**
   * rejected: the server refused the answers, so nothing was saved. unconfirmed: the outcome is
   * unknown; the same attempt key is kept, so resubmitting the same answers reconciles without
   * counting twice. key-conflict: this attempt key was already used for other answers.
   */
  | { status: "error"; kind: "rejected" | "unconfirmed" | "key-conflict"; message: string }
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
  if (!parsed.success) return { error: "We could not read your answers. Nothing was saved. Reload the page and try again." };
  return parsed.data;
}

export type SubmitError = Extract<QuizState, { status: "error" }>;

/** Postgres codes submit_quiz_attempt raises when it refuses an attempt; nothing is written in those cases. */
const REFUSED = new Set(["22023", "P0001", "P0002", "28000", "42501"]);

export const UNCONFIRMED: SubmitError = {
  status: "error",
  kind: "unconfirmed",
  message: "We could not confirm whether your answers were saved. Submit the same answers again: if they were saved, they will not count twice.",
};

/** Plain words for submit_quiz_attempt failures. "Nothing was saved" is said only when the server refused the attempt. */
export function classifySubmitError(error: { code?: string; message?: string } | null): SubmitError {
  const code = error?.code ?? "";
  if (!REFUSED.has(code)) return UNCONFIRMED;
  if (code === "22023" && error?.message?.includes("attemptKey")) {
    return { status: "error", kind: "key-conflict", message: "These answers differ from an attempt you already submitted. Start a new attempt to submit them." };
  }
  const message = {
    "22023": "Your answers did not match this quiz. Nothing was saved. Reload the page and try again.",
    P0002: "This course is no longer assigned to you here. Nothing was saved. Reload the page.",
    P0001: "This course version has no graded quiz. Nothing was saved.",
  }[code] ?? "Your answers could not be submitted. Nothing was saved. Sign in again and retry.";
  return { status: "error", kind: "rejected", message };
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
  // Says what is left rather than repeating the overview's "N of M lessons done" progress label.
  const remaining = Math.max(0, s.lessonsTotal - s.lessonsCompleted);
  const lessons = remaining === 0 ? "Every lesson is done." : `${remaining} ${remaining === 1 ? "lesson" : "lessons"} still to do.`;
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

/**
 * The module quiz page of a course. It sits two segments below the course so it can never
 * shadow a lesson route, which is always exactly one segment.
 */
export function moduleQuizHref(courseHref: string): string {
  return `${courseHref}/module/quiz`;
}

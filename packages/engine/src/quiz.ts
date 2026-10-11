// Pure graded-quiz rules (ADR 0007). They mirror the database, which is the
// authority: it scores attempts from the assigned immutable version and works
// out module completion. The app uses these to explain results, never to
// decide them.
import { PASS_PERCENT, type ClaimIntegrityState, type Course, type QuizAnswer } from "@spindle/schema";

export interface GradedQuestion {
  /** '<lesson id>:q<n>': the n-th science quiz block in that lesson, counted from 1. */
  questionId: string;
  lessonId: string;
  prompt: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

/** Every quiz block that binds science, in course order. Practice quizzes are ungraded discussion. */
export function gradedQuestions(course: Course): GradedQuestion[] {
  return course.parts.flatMap((part) =>
    part.lessons.flatMap((lesson) => {
      let n = 0;
      return lesson.blocks.flatMap((block) => {
        if (block.kind !== "quiz" || block.support !== "science") return [];
        n += 1;
        return [{ questionId: `${lesson.id}:q${n}`, lessonId: lesson.id, ...block.content }];
      });
    }),
  );
}

/** At least 80% of the graded questions, in integer arithmetic. */
export function passes(correct: number, total: number): boolean {
  return total > 0 && correct * 100 >= total * PASS_PERCENT;
}

export interface ScoredAttempt {
  correct: number;
  total: number;
  passed: boolean;
  results: { questionId: string; correct: boolean }[];
}

/** Scores answers as the database does. Throws on a missing, duplicate, unknown or out-of-range answer. */
export function scoreAttempt(questions: readonly GradedQuestion[], answers: readonly QuizAnswer[]): ScoredAttempt {
  const byId = new Map(questions.map((q) => [q.questionId, q]));
  const given = new Map<string, number>();
  for (const { questionId, answerIndex } of answers) {
    const question = byId.get(questionId);
    invariant(question, `${questionId} is not a graded question in this version`);
    invariant(!given.has(questionId), `${questionId} is answered twice`);
    invariant(Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex < question.options.length, `${questionId} has an answer outside its options`);
    given.set(questionId, answerIndex);
  }
  invariant(given.size === questions.length, "every graded question needs exactly one answer");
  const results = questions.map((q) => ({ questionId: q.questionId, correct: given.get(q.questionId) === q.answerIndex }));
  const correct = results.filter((r) => r.correct).length;
  return { correct, total: questions.length, passed: passes(correct, questions.length), results };
}

export interface AttemptSummary {
  id: string;
  correct: number;
  total: number;
  /** ISO 8601; compared as instants. */
  submittedAt: string;
}

/** The best attempt counts: most correct, then the earliest. */
export function bestAttempt<T extends AttemptSummary>(attempts: readonly T[]): T | null {
  let best: T | null = null;
  for (const a of attempts) {
    if (
      !best ||
      a.correct > best.correct ||
      (a.correct === best.correct && (Date.parse(a.submittedAt) < Date.parse(best.submittedAt) || (a.submittedAt === best.submittedAt && a.id < best.id)))
    ) {
      best = a;
    }
  }
  return best;
}

/** Quiz credit carries to another version of the course only when both have the same, non-empty question set. */
export function quizCreditCarries(fromQuestionSetHash: string | null, toQuestionSetHash: string | null): boolean {
  return fromQuestionSetHash !== null && fromQuestionSetHash === toQuestionSetHash;
}

export interface ModuleCompletionInput {
  lessonIds: readonly string[];
  completedLessonIds: readonly string[];
  /** "phase2" versions keep the lessons-only rule. */
  rules: "phase2" | "phase3";
  questionSetHash: string | null;
  /** The learner's attempts in this version, in this gym. */
  attempts: readonly AttemptSummary[];
  /** Whether a passing attempt in another version of the course, same gym, has the same question-set hash. */
  carriedPass: boolean;
}

export interface ModuleCompletion {
  quizRequired: boolean;
  quizPassed: boolean;
  complete: boolean;
}

/** Every lesson complete and, when a graded quiz applies, a passing attempt (own or carried). */
export function moduleCompletion(input: ModuleCompletionInput): ModuleCompletion {
  const quizRequired = input.rules === "phase3" && input.questionSetHash !== null;
  const best = bestAttempt(input.attempts);
  const quizPassed = quizRequired && ((best !== null && passes(best.correct, best.total)) || input.carriedPass);
  const done = new Set(input.completedLessonIds);
  const lessonsDone = input.lessonIds.length > 0 && input.lessonIds.every((id) => done.has(id));
  return { quizRequired, quizPassed, complete: lessonsDone && (!quizRequired || quizPassed) };
}

export interface BlockEvidence {
  /** False when any cited claim was withdrawn (or its state is unknown): the block loses the Science presentation. */
  presentsAsScience: boolean;
  withdrawn: boolean;
  retracted: boolean;
  recheckDue: boolean;
}

/**
 * How a science block presents given its claims' integrity states (version_integrity).
 * A claim with no reported state counts as withdrawn: fail closed.
 */
export function blockEvidence(claimIds: readonly string[], states: ReadonlyMap<string, ClaimIntegrityState>): BlockEvidence {
  const seen = claimIds.map((id) => states.get(id) ?? "withdrawn");
  const withdrawn = seen.includes("withdrawn");
  return {
    presentsAsScience: claimIds.length > 0 && !withdrawn,
    withdrawn,
    retracted: seen.includes("retracted"),
    recheckDue: seen.includes("recheck_due"),
  };
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid quiz attempt: ${message}`);
}

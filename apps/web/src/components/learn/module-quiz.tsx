"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, LoaderCircle, RotateCcw, X } from "lucide-react";
import { fieldName, neededToPass, type QuizQuestionView, type QuizState } from "@/lib/learning/quiz";

/**
 * The graded module quiz. `submit` is a server action bound to the rendered route on
 * the server; the form sends only the attempt key and one answer per question. The
 * learner never receives the answer key before submitting: correctness and
 * explanations come back from the server with the scored result.
 */
export function ModuleQuiz({ questions, submit }: { questions: QuizQuestionView[]; submit: (prev: QuizState, form: FormData) => Promise<QuizState> }) {
  const [state, action, pending] = useActionState<QuizState, FormData>(submit, { status: "idle" });
  // One key per attempt: a double submit reuses it (the server treats that as the same
  // attempt); "Try again" starts a new one. Created on first submit, so it never has to
  // match between the server render and the browser.
  const attemptKey = useRef<string | null>(null);
  // The attempt whose result the learner put away with "Try again"; the form starts empty.
  const [dismissed, setDismissed] = useState<string | null>(null);
  const shown: QuizState = state.status === "result" && state.attemptId === dismissed ? { status: "idle" } : state;
  return (
    <QuizView
      key={dismissed ?? "first"}
      questions={questions}
      state={shown}
      pending={pending}
      action={(form) => {
        attemptKey.current ??= crypto.randomUUID();
        form.set("attemptKey", attemptKey.current);
        action(form);
      }}
      onTryAgain={() => {
        attemptKey.current = null;
        if (state.status === "result") setDismissed(state.attemptId);
      }}
    />
  );
}

/** Every quiz state without data access (the design specimen mounts it too). */
export function QuizView({
  questions,
  state,
  pending,
  action,
  onTryAgain,
}: {
  questions: QuizQuestionView[];
  state: QuizState;
  pending: boolean;
  action: (form: FormData) => void;
  onTryAgain: () => void;
}) {
  const resultRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.status === "result") resultRef.current?.focus();
  }, [state.status]);

  const result = state.status === "result" ? state : null;
  const feedback = new Map(result?.feedback?.map((f) => [f.questionId, f]) ?? []);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-label text-text-muted">
        {questions.length} {questions.length === 1 ? "question" : "questions"}. You need {neededToPass(questions.length)} correct to pass. You can try as many
        times as you like; your best attempt counts.
      </p>
      <form action={action} className="flex flex-col gap-6" aria-describedby="quiz-status">
        {questions.map((q, i) => {
          // A lesson heading before the first question of each lesson.
          const heading = q.lessonTitle && q.lessonTitle !== questions[i - 1]?.lessonTitle ? q.lessonTitle : null;
          const f = feedback.get(q.questionId);
          return (
            <div key={q.questionId} className="flex flex-col gap-3">
              {heading ? <h2 className="text-lg font-medium text-text">{heading}</h2> : null}
              <fieldset data-question={q.questionId} disabled={pending || result !== null} className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4">
                <legend className="px-1 text-base font-medium text-text">
                  <span className="font-mono text-code text-text-muted">{i + 1}.</span> {q.prompt}
                </legend>
                {q.options.map((option, index) => (
                  <label key={index} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-control px-3 has-[:checked]:border-ink has-[:checked]:bg-surface-muted">
                    <input type="radio" name={fieldName(q.questionId)} value={index} required className="size-4 accent-[var(--color-ink)]" />
                    <span>{option}</span>
                  </label>
                ))}
                {f ? <Feedback correct={f.correct}>{f.explanation}</Feedback> : null}
              </fieldset>
            </div>
          );
        })}
        {result ? null : (
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-12 min-w-56 items-center justify-center gap-2 self-start rounded-control bg-ink px-5 font-medium text-white hover:bg-ink-hover disabled:cursor-progress disabled:opacity-80"
          >
            {pending ? <LoaderCircle aria-hidden strokeWidth={1.75} className="size-5 animate-spin motion-reduce:animate-none" /> : null}
            {pending ? "Submitting…" : "Submit answers"}
          </button>
        )}
      </form>

      <div id="quiz-status" aria-live="polite" className="flex flex-col gap-3">
        {state.status === "error" ? (
          <p role="alert" className="rounded-small bg-danger-soft px-3 py-2 text-sm text-danger">
            {state.message}
          </p>
        ) : null}
        {result ? (
          <div ref={resultRef} tabIndex={-1} data-testid="quiz-result" className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
            <p className="text-base">
              <span className="font-medium">{result.passed ? "Passed." : "Not passed yet."}</span> You got {result.correct} of {result.total} correct.{" "}
              {result.passed ? "This attempt counts toward the module." : `You need ${neededToPass(result.total)} to pass.`}
            </p>
            {result.feedback === null ? <p className="text-label text-text-muted">Feedback for each question is not available for this attempt.</p> : null}
            <button
              type="button"
              onClick={onTryAgain}
              className="inline-flex min-h-11 items-center gap-2 self-start rounded-control border border-control bg-surface px-4 font-medium text-text hover:bg-surface-muted"
            >
              <RotateCcw aria-hidden strokeWidth={1.75} className="size-4" />
              {result.passed ? "Take it again" : "Try again"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Feedback({ correct, children }: { correct: boolean; children: ReactNode }) {
  return (
    <p className="mt-1 flex items-start gap-2 text-base">
      {correct ? <Check aria-hidden strokeWidth={1.75} className="mt-1 size-4 shrink-0" /> : <X aria-hidden strokeWidth={1.75} className="mt-1 size-4 shrink-0" />}
      <span>
        <span className="font-medium">{correct ? "Correct." : "Not quite."}</span> {children}
      </span>
    </p>
  );
}

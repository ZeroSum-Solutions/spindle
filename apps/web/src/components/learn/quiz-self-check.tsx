"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";

/**
 * Ungraded self-check. Nothing is saved and it does not affect completion:
 * persisted, graded quizzes arrive with phase 3. The page says so.
 */
export function QuizSelfCheck({
  id,
  prompt,
  options,
  answerIndex,
  explanation,
}: {
  id: string;
  prompt: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [checked, setChecked] = useState<number | null>(null);
  const correct = checked === answerIndex;

  return (
    <form
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (selected !== null) setChecked(selected);
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-medium">{prompt}</legend>
        {options.map((option, i) => (
          <label
            key={i}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-control px-3 py-2 has-[:checked]:border-ink has-[:checked]:bg-surface-muted"
          >
            <input
              type="radio"
              name={id}
              value={i}
              checked={selected === i}
              onChange={() => {
                setSelected(i);
                setChecked(null);
              }}
              className="size-4 accent-ink"
            />
            <span>{option}</span>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={selected === null}
          className="inline-flex min-h-11 items-center rounded-control border border-control bg-surface px-4 font-medium hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
        >
          Check answer
        </button>
        <span className="text-label text-text-muted">Self-check. Your answer is not saved or graded.</span>
      </div>
      <div aria-live="polite">
        {checked !== null ? (
          <div className="confirm-appear flex flex-col gap-1 rounded-control bg-surface-muted p-3">
            <p className="flex items-center gap-1.5 font-medium">
              {correct ? <Check aria-hidden strokeWidth={1.75} className="size-4" /> : <X aria-hidden strokeWidth={1.75} className="size-4" />}
              {correct ? "That matches the answer." : `Not quite. The answer is: ${options[answerIndex]}`}
            </p>
            <p>{explanation}</p>
          </div>
        ) : null}
      </div>
    </form>
  );
}

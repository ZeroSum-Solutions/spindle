"use client";

import { useActionState, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { completeLesson, type CompleteState } from "@/app/gyms/[slug]/learn/actions";
import { formatDate } from "@/lib/learning/format";

/**
 * Marks the lesson done. Pending disables the button (no double submit). The check
 * draws only after the server confirms, and the text names the version the
 * completion belongs to. Failure keeps the button for a retry. This component stays
 * mounted when the page re-renders after the save, so the confirmation is not lost;
 * a lesson that was already done on load shows a static receipt with no motion.
 */
export function CompleteLesson({
  gym,
  assignmentId,
  lessonId,
  done,
  receipt,
}: {
  gym: string;
  assignmentId: string;
  lessonId: string;
  /** Done or credited when the page loaded, according to the database. */
  done: boolean;
  /** Server-written explanation of the existing completion or credit. */
  receipt: ReactNode;
}) {
  const [state, action, pending] = useActionState<CompleteState, FormData>(completeLesson, { status: "idle" });

  if (state.status === "saved") {
    return (
      <div role="status" data-testid="lesson-status" className="confirm-appear flex items-center gap-3 rounded-card border border-border bg-surface p-4">
        <ConfirmCheck animate />
        <p>
          <span className="font-medium">Saved.</span> Lesson completed for v{state.versionNumber} on {formatDate(state.completedAt)}.
        </p>
      </div>
    );
  }
  if (done) {
    return (
      <div data-testid="lesson-status" className="flex items-center gap-3 rounded-card border border-border bg-surface p-4">
        <ConfirmCheck />
        <p>{receipt}</p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      {receipt ? <p className="text-text-muted">{receipt}</p> : null}
      <input type="hidden" name="gym" value={gym} />
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <input type="hidden" name="lessonId" value={lessonId} />
      <button
        type="submit"
        disabled={pending}
        aria-describedby={state.status === "error" ? "complete-error" : undefined}
        className="inline-flex min-h-12 min-w-56 items-center justify-center gap-2 self-start rounded-control bg-ink px-5 font-medium text-white hover:bg-ink-hover disabled:cursor-progress disabled:opacity-80"
      >
        {pending ? <LoaderCircle aria-hidden strokeWidth={1.75} className="size-5 animate-spin motion-reduce:animate-none" /> : null}
        {pending ? "Saving…" : state.status === "error" ? "Try again" : "Mark lesson complete"}
      </button>
      <div aria-live="polite">
        {state.status === "error" ? (
          <p id="complete-error" role="alert" className="confirm-appear rounded-small bg-danger-soft px-3 py-2 text-danger">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

/** Completion check. `animate` draws the stroke once (320ms); reduced motion shows it finished. */
export function ConfirmCheck({ animate = false }: { animate?: boolean }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-white">
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        className={`size-5 ${animate ? "confirm-check" : ""}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  );
}

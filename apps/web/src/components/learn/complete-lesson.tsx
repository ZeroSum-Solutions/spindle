"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { completeLesson, type CompleteState } from "@/app/gyms/[slug]/learn/actions";
import { formatDate } from "@/lib/learning/format";

/**
 * Marks the lesson done. This component stays mounted when the page re-renders
 * after the save, so the server's confirmation is not lost.
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
  return (
    <CompletionView state={state} pending={pending} done={done} receipt={receipt} action={action}>
      <input type="hidden" name="gym" value={gym} />
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <input type="hidden" name="lessonId" value={lessonId} />
    </CompletionView>
  );
}

/**
 * Every completion state, without data access (the design specimen mounts it too).
 * Pending disables the button, so a double click cannot submit twice. The check
 * draws only after a confirmed save and names the version; a lesson already done on
 * load shows a static receipt. Failure keeps the button for a retry.
 */
export function CompletionView({
  state,
  pending,
  done,
  receipt,
  action,
  children,
}: {
  state: CompleteState;
  pending: boolean;
  done: boolean;
  receipt: ReactNode;
  action: (form: FormData) => void;
  children?: ReactNode;
}) {
  // One live region stays mounted across every state, so screen readers announce the
  // result; focus moves to the confirmation because the button it was on is gone.
  const saved = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.status === "saved") saved.current?.focus();
  }, [state.status]);

  let body: ReactNode;
  if (state.status === "saved") {
    body = (
      <div ref={saved} tabIndex={-1} data-testid="lesson-status" className="confirm-appear flex items-center gap-3 rounded-card border border-border bg-surface p-4">
        <ConfirmCheck animate />
        <p>
          <span className="font-medium">Saved.</span> Lesson completed for v{state.versionNumber} on {formatDate(state.completedAt)}.
        </p>
      </div>
    );
  } else if (done) {
    body = (
      <div data-testid="lesson-status" className="flex items-center gap-3 rounded-card border border-border bg-surface p-4">
        <ConfirmCheck />
        <p>{receipt}</p>
      </div>
    );
  } else {
    body = (
      <form action={action} className="flex flex-col gap-3">
        {receipt ? <p className="text-text-muted">{receipt}</p> : null}
        {children}
        <button
          type="submit"
          disabled={pending}
          aria-describedby={state.status === "error" ? "complete-error" : undefined}
          className="inline-flex min-h-12 min-w-56 items-center justify-center gap-2 self-start rounded-control bg-ink px-5 font-medium text-white hover:bg-ink-hover disabled:cursor-progress disabled:opacity-80"
        >
          {pending ? <LoaderCircle aria-hidden strokeWidth={1.75} className="size-5 animate-spin motion-reduce:animate-none" /> : null}
          {pending ? "Saving…" : state.status === "error" ? "Try again" : "Mark lesson complete"}
        </button>
        {state.status === "error" ? (
          <p id="complete-error" className="confirm-appear rounded-small bg-danger-soft px-3 py-2 text-danger">
            {state.message}
          </p>
        ) : null}
      </form>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {body}
      <p aria-live="polite" className="sr-only">
        {pending ? "Saving your progress." : state.status === "saved" ? `Saved. Lesson completed for version ${state.versionNumber}.` : state.status === "error" ? state.message : ""}
      </p>
    </div>
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

"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { CompletionView } from "@/components/learn/complete-lesson";
import type { CompleteState } from "@/lib/learning/completion";

type Demo = "idle" | "pending" | "saved" | "error" | "done";

const STATES: Record<Demo, { state: CompleteState; pending: boolean; done: boolean }> = {
  idle: { state: { status: "idle" }, pending: false, done: false },
  pending: { state: { status: "idle" }, pending: true, done: false },
  saved: { state: { status: "saved", completedAt: "2026-10-11T09:30:00+00:00", versionNumber: 2 }, pending: false, done: false },
  error: { state: { status: "error", message: "We could not save your progress. Try again." }, pending: false, done: false },
  done: { state: { status: "idle" }, pending: false, done: true },
};

/** Demo only: replays each completion state with the real component. Nothing is sent or saved. */
export function CompletionBoard() {
  const [demo, setDemo] = useState<Demo>("idle");
  const [run, setRun] = useState(0);
  const s = STATES[demo];
  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Completion state" className="flex flex-wrap gap-2">
        {(Object.keys(STATES) as Demo[]).map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={demo === d}
            onClick={() => {
              setDemo(d);
              setRun((n) => n + 1);
            }}
            className="min-h-11 rounded-control border border-control bg-surface px-3 text-label font-medium aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-white"
          >
            {d === "done" ? "Done on load" : d[0]!.toUpperCase() + d.slice(1)}
          </button>
        ))}
      </div>
      <div key={run} className="min-h-24">
        <CompletionView
          state={s.state}
          pending={s.pending}
          done={s.done}
          receipt={s.done ? <><span className="font-medium">Credited.</span> Credit carried from your completion on 1 Oct 2026 in v1.</> : null}
          action={() => setDemo("pending")}
        />
      </div>
    </div>
  );
}

/** Demo only: the wordmark reveal for brand surfaces, along the d cut's 12° slant. Never gates app access. */
export function LogoReveal() {
  const [run, setRun] = useState(0);
  return (
    <div className="flex flex-col items-start gap-4">
      <div className="rounded-card border border-border bg-surface p-8">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand SVG */}
        <img key={run} src="/brand/spindle-wordmark-ink.svg" alt="Spindle" width={240} height={66} className="logo-reveal h-[66px] w-[240px]" />
      </div>
      <button
        type="button"
        onClick={() => setRun((n) => n + 1)}
        className="inline-flex min-h-11 items-center gap-2 rounded-control border border-control bg-surface px-3 text-label font-medium"
      >
        <RotateCcw aria-hidden strokeWidth={1.75} className="size-4" />
        Replay reveal
      </button>
    </div>
  );
}

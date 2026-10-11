"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { MOTION } from "../../lib/theme/foundations";

/** Replays every duration token on its curve. "Reduced motion" shows the static end state, as the app does. */
export function MotionTokens() {
  const [run, setRun] = useState(0);
  const [reduced, setReduced] = useState(false);
  return (
    <div className="flex flex-col gap-stack">
      <div className="flex flex-wrap gap-tight">
        <button type="button" onClick={() => setRun((n) => n + 1)} className="pressable inline-flex min-h-11 items-center gap-2 rounded-control border border-control bg-surface px-3 text-label font-semibold">
          <RotateCcw aria-hidden strokeWidth={1.75} className="size-4" />
          Replay
        </button>
        <button type="button" aria-pressed={reduced} onClick={() => setReduced((r) => !r)} className="min-h-11 rounded-control border border-control bg-surface px-3 text-label font-semibold aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-white">
          Reduced motion
        </button>
      </div>
      <ul className="flex flex-col gap-attach">
        {MOTION.map((m) => (
          <li key={m.token} className="grid grid-cols-[minmax(0,10rem)_1fr] items-center gap-stack">
            <span className="flex flex-col">
              <span className="text-code">
                {m.token} {m.ms}ms
              </span>
              <span className="text-label text-text-muted">{m.use}</span>
            </span>
            <span className="relative h-2 overflow-hidden bg-surface-muted">
              <span
                key={`${run}-${reduced}`}
                aria-hidden
                data-motion-bar={m.token}
                className="absolute inset-0 origin-left bg-signal"
                style={reduced ? undefined : { animation: `motion-token-fill var(--duration-${m.token}) var(--ease-${m.ease}) both` }}
              />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

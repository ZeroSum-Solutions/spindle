"use client";

import { LearnShell } from "@/components/learn/shell";

// Server error messages are replaced by a generic one in production, so the copy here is our own.
export default function LearnError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <LearnShell>
      <div role="alert" className="flex max-w-xl flex-col gap-3 rounded-card border border-danger/30 bg-danger-soft p-5">
        <p className="font-medium text-danger">We could not load this page.</p>
        <p>Your progress is safe. Try again, or come back in a minute.</p>
        <button
          className="inline-flex min-h-11 items-center self-start rounded-control border border-control bg-surface px-4 font-medium hover:bg-surface-muted"
          onClick={() => retry()}
        >
          Try again
        </button>
      </div>
    </LearnShell>
  );
}

"use client";

import { Page } from "@/components/ui";

// Server error messages are replaced by a generic one in production, so the
// copy here is our own.
export default function GymsError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <Page title="Something went wrong">
      <p role="alert">We could not load this page. Your data is safe.</p>
      <button className="min-h-11 self-start underline underline-offset-4" onClick={() => retry()}>
        Try again
      </button>
    </Page>
  );
}

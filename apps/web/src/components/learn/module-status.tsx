import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import type { ModuleStatus } from "@spindle/schema";
import { moduleStatusView } from "@/lib/learning/quiz";

/**
 * Module completion as the server works it out (module_status): every lesson done and,
 * when the version has a graded quiz, a passing attempt. A status the app could not
 * read says so; it is never shown as zero or as "not complete".
 */
export function ModuleStatusCard({ status, quizHref }: { status: ModuleStatus | null; quizHref: string | null }) {
  if (!status) {
    return (
      <p role="status" data-testid="module-status" className="rounded-card border border-border bg-surface p-4 text-text-muted">
        Module status is unavailable right now. Your progress is safe; reload the page to try again.
      </p>
    );
  }
  const view = moduleStatusView(status);
  return (
    <section aria-labelledby="module-status-title" data-testid="module-status" data-complete={view.complete} className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4 md:p-5">
      <h2 id="module-status-title" className="flex items-center gap-2 text-lg font-medium text-text">
        {view.complete ? <Check aria-hidden strokeWidth={1.75} className="size-5 shrink-0" /> : null}
        {view.headline}
      </h2>
      <p className="text-base text-text">{view.lessons}</p>
      <p className="text-base text-text">{view.quiz}</p>
      {quizHref && view.offerQuiz ? (
        <Link
          href={quizHref}
          className="mt-1 inline-flex min-h-11 items-center gap-2 self-start rounded-control border border-control bg-surface px-4 font-medium text-text hover:bg-surface-muted"
        >
          Take the module quiz
          <ArrowRight aria-hidden strokeWidth={1.75} className="size-4" />
        </Link>
      ) : quizHref && status.quizRequired ? (
        <Link href={quizHref} className="inline-flex min-h-11 items-center self-start font-medium text-brand hover:text-brand-hover">
          Take the quiz again
        </Link>
      ) : null}
    </section>
  );
}

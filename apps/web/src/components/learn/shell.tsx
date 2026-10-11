import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppHeader } from "@/components/ui";

/** Learner frame: header with gym context, a back link, then the page. */
export function LearnShell({ gym, back, children }: { gym?: string; back?: { href: string; label: string }; children: ReactNode }) {
  return (
    <>
      <AppHeader context={gym} />
      <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-6 px-4 py-8 md:px-8 md:py-12">
        {back ? (
          <Link href={back.href} className="-ml-1 inline-flex min-h-11 items-center gap-1.5 self-start px-1 text-label text-brand hover:text-brand-hover">
            <ArrowLeft aria-hidden strokeWidth={1.75} className="size-4" />
            {back.label}
          </Link>
        ) : null}
        {children}
      </main>
    </>
  );
}

export function LoadingNote({ children }: { children: ReactNode }) {
  return <p className="text-text-muted">{children}</p>;
}

/** The version cannot be shown: say so without rendering any part of it. */
export function VersionUnavailable({ versionNumber }: { versionNumber: number }) {
  return (
    <div role="alert" className="rounded-card border border-danger/30 bg-danger-soft p-4">
      <p className="font-medium text-danger">This course version (v{versionNumber}) can&apos;t be displayed.</p>
      <p className="mt-1">Its stored content did not pass our checks. Tell your gym lead. Your progress is safe.</p>
    </div>
  );
}

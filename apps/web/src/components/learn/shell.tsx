import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppHeader } from "@/components/ui";

/** Centered content widths: a 768px column for lists and overviews; outline plus reading column for the player. */
const FRAME = { column: "max-w-3xl", reading: "max-w-[46rem] lg:max-w-[63rem]" } as const;

/** Learner frame: header with gym context, then a centered column with a back link and the page. */
export function LearnShell({
  gym,
  back,
  frame = "column",
  dock,
  children,
}: {
  gym?: string;
  back?: { href: string; label: string };
  frame?: keyof typeof FRAME;
  /** The bottom lesson bar below 1024px. The page reserves its measured height (--dock-h; 4.5rem until measured) after the content; from 1024px there is no bar and nothing is reserved. */
  dock?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <AppHeader context={gym} frame={FRAME[frame]} />
      <main className={`flex w-full flex-1 flex-col px-4 pt-8 md:px-8 md:pt-12 ${dock ? "pb-[calc(var(--dock-h,4.5rem)+2rem)] md:pb-[calc(var(--dock-h,4.5rem)+3rem)] lg:pb-12" : "pb-8 md:pb-12"}`}>
        <div data-frame={frame} className={`mx-auto flex w-full flex-col gap-6 ${FRAME[frame]}`}>
        {back ? (
          <Link href={back.href} className="-ml-1 inline-flex min-h-11 items-center gap-1.5 self-start px-1 text-label text-brand hover:text-brand-hover">
            <ArrowLeft aria-hidden strokeWidth={1.75} className="size-4" />
            {back.label}
          </Link>
        ) : null}
        {children}
        </div>
      </main>
      {dock}
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

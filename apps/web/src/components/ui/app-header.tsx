import type { ReactNode } from "react";
import Link from "next/link";
import { SPINDLE } from "../../lib/brand";
import { ThemeToggle } from "../theme/theme-toggle";
import { ThemedWordmark } from "./themed-wordmark";

/**
 * The app header: wordmark home link, optional gym context, and the theme toggle on the right.
 * `frame` is the page's content frame, so the wordmark lines up with the content below it.
 * The 64px bar leaves room above the 44px link for the 3px focus ring and its 4px offset.
 */
export function AppHeader({ context, frame = "max-w-[1440px]" }: { context?: ReactNode; frame?: string }) {
  return (
    <header className="border-b border-border bg-surface px-4 md:px-8">
      <div className={`mx-auto flex min-h-16 w-full items-center justify-between gap-4 ${frame}`}>
        <Link href="/gyms" className="-mx-1 inline-flex min-h-11 shrink-0 items-center px-1" aria-label="Spindle, your gyms">
          {/* The full wordmark is never shorter than 24px, so the cuts stay open. */}
          <ThemedWordmark brand={SPINDLE} />
        </Link>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
          {context ? (
            <div data-header-context title={typeof context === "string" ? context : undefined} className="min-w-0 truncate text-right text-label text-text-muted">
              {context}
            </div>
          ) : null}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

export function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      {/* The header frame matches the main column's content box (36rem less its 1rem padding each side). */}
      <AppHeader frame="max-w-[34rem]" />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-12">
        <h1 className="text-heading text-text">{title}</h1>
        {children}
      </main>
    </>
  );
}

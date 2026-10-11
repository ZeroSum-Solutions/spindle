import type { ReactNode } from "react";
import Link from "next/link";
import { SPINDLE } from "../../lib/brand";

/**
 * The app header: wordmark home link, plus optional gym context on the right. `frame`
 * is the page's content frame, so the wordmark lines up with the content below it.
 * The 64px bar leaves room above the 44px link for the 3px focus ring and its 4px offset.
 */
export function AppHeader({ context, frame = "max-w-[1440px]" }: { context?: ReactNode; frame?: string }) {
  const { width, height } = SPINDLE.wordmark;
  return (
    <header className="border-b border-border bg-surface px-4 md:px-8">
      <div className={`mx-auto flex min-h-16 w-full items-center justify-between gap-4 ${frame}`}>
        <Link href="/gyms" className="-mx-1 inline-flex min-h-11 shrink-0 items-center px-1" aria-label="Spindle, your gyms">
          {/* The full wordmark is never narrower than 120px, so the d cut stays legible. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG gains nothing from the optimizer */}
          <img src={SPINDLE.wordmark.onLight} alt="" width={width} height={height} style={{ width, height }} className="max-w-none" />
        </Link>
        {context ? (
          <div data-header-context title={typeof context === "string" ? context : undefined} className="min-w-0 flex-1 truncate text-right text-label text-text-muted">
            {context}
          </div>
        ) : null}
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

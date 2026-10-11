import type { ReactNode } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";

/**
 * The app header: wordmark home link, plus optional gym context on the right. `frame`
 * is the page's content frame, so the wordmark lines up with the content below it.
 * The 64px bar leaves room above the 44px link for the 3px focus ring and its 4px offset.
 */
export function AppHeader({ context, frame = "max-w-[1440px]" }: { context?: ReactNode; frame?: string }) {
  return (
    <header className="border-b border-border bg-surface px-4 md:px-8">
      <div className={`mx-auto flex min-h-16 w-full items-center justify-between gap-4 ${frame}`}>
        <Link href="/gyms" className="-mx-1 inline-flex min-h-11 shrink-0 items-center px-1" aria-label="Spindle, your gyms">
          {/* The full wordmark is never narrower than 120px, so the d cut stays legible. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG gains nothing from the optimizer */}
          <img src="/brand/spindle-wordmark-ink.svg" alt="" width={120} height={33} className="h-[33px] w-[120px] max-w-none" />
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
        <h1 className="text-heading font-medium text-text">{title}</h1>
        {children}
      </main>
    </>
  );
}

export function ErrorNote({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-small bg-danger-soft px-3 py-2 text-sm text-danger">
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
      <span>{message}</span>
    </p>
  );
}

export function Field({ label, name, ...props }: { label: string; name: string } & React.ComponentProps<"input">) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <input name={name} className="min-h-11 rounded-control border border-control bg-surface px-3 text-base" {...props} />
    </label>
  );
}

const BUTTON = {
  primary: "bg-ink text-white hover:bg-ink-hover",
  secondary: "border border-control bg-surface text-text hover:bg-surface-muted",
} as const;

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ComponentProps<"button"> & { variant?: keyof typeof BUTTON }) {
  return (
    <button
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-control px-4 font-medium transition-colors duration-[var(--duration-feedback)] disabled:cursor-not-allowed disabled:opacity-60 ${BUTTON[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

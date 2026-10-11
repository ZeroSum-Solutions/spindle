import type { ReactNode } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";

/** The app header: wordmark home link, plus optional gym context on the right. */
export function AppHeader({ context }: { context?: ReactNode }) {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex min-h-14 w-full max-w-[1440px] items-center justify-between gap-4 px-4 md:px-8">
        <Link href="/gyms" className="-mx-1 inline-flex min-h-11 items-center px-1" aria-label="Spindle, your gyms">
          {/* The full wordmark is never narrower than 120px, so the d cut stays legible. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG gains nothing from the optimizer */}
          <img src="/brand/spindle-wordmark-ink.svg" alt="" width={120} height={33} className="h-[33px] w-[120px]" />
        </Link>
        {context ? <div className="min-w-0 truncate text-label text-text-muted">{context}</div> : null}
      </div>
    </header>
  );
}

export function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <AppHeader />
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

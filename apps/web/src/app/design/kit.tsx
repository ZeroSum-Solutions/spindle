import type { ReactNode } from "react";
import { SpindleWordmark } from "../../components/brand-mark/wordmark";
import { ThemeToggle } from "../../components/theme/theme-toggle";

// The structure of the living kit: a masthead, a sticky section nav (it scrolls sideways on phones and
// carries the theme toggle), numbered parts, numbered component cards, and side-by-side theme panes.

export const KIT_PARTS = [
  ["direction", "Direction"],
  ["logo", "Logo"],
  ["colour", "Colour"],
  ["type", "Type"],
  ["tokens", "Tokens"],
  ["components", "Components"],
  ["screens", "Screens"],
  ["motion", "Motion"],
  ["brand", "Brand in use"],
  ["progress", "Progress"],
  ["checks", "Checks"],
] as const;
export type KitPartId = (typeof KIT_PARTS)[number][0];

const partNumber = (id: KitPartId) => String(KIT_PARTS.findIndex(([p]) => p === id) + 1).padStart(2, "0");

export function KitMasthead() {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-block px-4 py-section md:px-8">
        <SpindleWordmark height={36} className="text-text" />
        <div className="flex max-w-[66ch] flex-col gap-stack">
          <p className="text-eyebrow text-text-muted">Spindle Lab · design kit · development only</p>
          <h1 className="text-title text-text">A performance lab, light and dark.</h1>
          <p className="text-reading text-text-muted">
            The living kit: every token and component is the real one, drawn in Lab Light and Lab Dark side by side. Synthetic data; nothing here is saved or
            real curriculum. The toggle switches the whole page; each pane below is pinned to its theme.
          </p>
        </div>
      </div>
    </header>
  );
}

/** Sticky section nav: one row that scrolls sideways on phones, with the theme toggle always in reach. */
export function KitNav() {
  return (
    <nav aria-label="Kit sections" data-kit-nav className="sticky top-0 z-20 border-b border-border bg-canvas/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1200px] items-center gap-tight px-4 md:px-8">
        <ol className="flex min-w-0 flex-1 gap-hair overflow-x-auto py-tight [scrollbar-width:none]">
          {KIT_PARTS.map(([id, label]) => (
            <li key={id} className="shrink-0">
              <a href={`#${id}`} className="inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-control px-2.5 text-label text-text hover:bg-surface-muted">
                <span className="text-code tabular text-text-muted">{partNumber(id)}</span>
                {label}
              </a>
            </li>
          ))}
        </ol>
        <ThemeToggle />
      </div>
    </nav>
  );
}

/** One numbered part: "Lab · 03", its title and a one-paragraph lead. */
export function KitPart({ id, title, lead, children }: { id: KitPartId; title: string; lead: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-20 flex-col gap-block border-t border-border pt-section">
      <div className="flex max-w-[66ch] flex-col gap-tight">
        <p className="text-eyebrow text-signal">Lab · {partNumber(id)}</p>
        <h2 id={`${id}-title`} className="text-heading text-text">
          {title}
        </h2>
        <div className="text-reading text-text-muted">{lead}</div>
      </div>
      {children}
    </section>
  );
}

/** A numbered component card inside a part: "Button 01". */
export function KitCard({ n, title, note, children }: { n: number; title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <article aria-label={title} data-kit-card={title} className="flex min-w-0 flex-col gap-stack">
      <header className="flex items-baseline gap-attach border-b border-border pb-tight">
        <h3 className="text-subhead text-text">{title}</h3>
        <span className="text-code tabular text-text-muted">{String(n).padStart(2, "0")}</span>
      </header>
      {note ? <p className="max-w-[66ch] text-label text-text-muted">{note}</p> : null}
      {children}
    </article>
  );
}

/**
 * The same content in Lab Light and Lab Dark, whatever the page theme: each pane pins color-scheme, so
 *  every token inside resolves to that theme (.theme-scope re-declares them in globals.css). Panes sit side by side from 1024px, stacked below.
 * Pass a function when the content has element ids, so each pane can make its own.
 */
export function ThemePair({ children, wide = false }: { children: ReactNode | ((theme: "light" | "dark") => ReactNode); wide?: boolean }) {
  return (
    <div className={`grid grid-cols-1 gap-stack ${wide ? "" : "lg:grid-cols-2"}`}>
      {(["light", "dark"] as const).map((theme) => (
        <div key={theme} data-theme-pane={theme} className={`theme-scope theme-scope-${theme} flex min-w-0 flex-col gap-stack rounded-card border border-border bg-canvas p-stack text-text md:p-block`}>
          <p className="text-eyebrow text-text-muted">Lab {theme === "light" ? "Light" : "Dark"}</p>
          {typeof children === "function" ? children(theme) : children}
        </div>
      ))}
    </div>
  );
}

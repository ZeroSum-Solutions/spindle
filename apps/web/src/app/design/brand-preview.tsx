import type { CSSProperties } from "react";
import { TriangleAlert } from "lucide-react";
import { SupportLabel } from "@/components/learn/labels";
import { tenantFontClass } from "@/lib/theme/fonts";
import { LIGHT_SAGE, OXBLOOD, SAGE } from "@/lib/theme/preview-brands";
import { BASE_ATTRIBUTION, TENANT_FONTS, themeStyle, validateTheme, type ContrastCheck, type TenantTheme } from "@/lib/theme/tenant-theme";

// Development-only brand preview (phase 4 groundwork). The same base shoulder lesson under
// two hypothetical tenant brands. Only the tenant layer changes: mark, accent (links, the
// current lesson, selected controls, focus) and the heading font. Reading type, layout,
// science and practice colours, error colours and the base attribution stay Spindle's.

const OUTLINE = ["Shoulder anatomy a trainer needs", "Scapulohumeral rhythm", "Mobility and stability"];

function BrandFrame({ theme, checks }: { theme: TenantTheme; checks: ContrastCheck[] }) {
  const font = tenantFontClass(theme.font);
  const heading: CSSProperties = { fontFamily: font.family };
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <article
        data-brand-frame={theme.name}
        style={themeStyle(theme) as CSSProperties}
        className={`${font.className} flex flex-col overflow-hidden rounded-card border border-border bg-canvas`}
      >
        <header className="flex min-h-14 items-center justify-between gap-3 border-b border-border bg-surface px-4">
          <span data-tenant-mark style={{ ...heading, color: "var(--tenant-accent)" }} className="truncate text-xl font-semibold tracking-tight">
            {theme.name}
          </span>
          <span className="hidden shrink-0 text-label text-text-muted sm:inline">Gym method · Base</span>
        </header>
        <div className="flex flex-col gap-5 p-4 md:p-5">
          <ol aria-label="Course outline (preview)" className="flex flex-col gap-1 text-label">
            {OUTLINE.map((title, i) => (
              <li
                key={title}
                aria-current={i === 0 ? "page" : undefined}
                className={`rounded-small px-3 py-2 ${i === 0 ? "bg-[var(--tenant-accent-soft)] font-medium text-[var(--tenant-accent)]" : "text-text"}`}
              >
                <span className="font-mono text-code opacity-80">{String(i + 1).padStart(2, "0")}</span> {title}
              </li>
            ))}
          </ol>
          <div className="flex flex-col gap-1">
            <p className="text-label text-text-muted">Part 1 · Lesson 01 of 08</p>
            <h3 style={heading} className="text-heading font-semibold text-text">
              Shoulder anatomy a trainer needs
            </h3>
          </div>
          <section className="flex flex-col gap-2 border-l-2 border-science pl-4">
            <SupportLabel support="science" />
            <p className="text-reading">
              Three bones make the shoulder: the upper arm bone, the shoulder blade and the collarbone. The ball-and-socket joint joins the arm to the
              shoulder blade.
            </p>
            <a href="#brand-preview" className="self-start text-label font-medium text-[var(--tenant-accent)] underline underline-offset-2 hover:text-[var(--tenant-accent-hover)]">
              Show sources (1 claim)
            </a>
          </section>
          <section className="flex flex-col gap-2 border-l-2 border-practice pl-4">
            <SupportLabel support="practice-based" />
            <p className="text-reading">Find the landmarks on yourself first. With a client, ask before you touch.</p>
          </section>
          <div className="flex flex-col gap-2">
            <p className="text-label text-text-muted">Themed states</p>
            <div className="flex flex-wrap items-center gap-3 text-label">
              <span className="rounded-control bg-[var(--tenant-accent)] px-3 py-2 font-medium text-[var(--tenant-on-accent)]">Selected</span>
              <span className="rounded-control bg-[var(--tenant-accent-hover)] px-3 py-2 font-medium text-[var(--tenant-on-accent)]">Selected, hover</span>
              <span className="rounded-control px-3 py-2 font-medium text-[var(--tenant-accent)] outline-3 outline-offset-4 outline-[var(--focus-ring)]">Focus</span>
            </div>
            <p className="flex items-start gap-2 rounded-small bg-danger-soft px-3 py-2 text-label text-danger">
              <TriangleAlert aria-hidden strokeWidth={1.75} className="mt-0.5 size-4 shrink-0" />
              Error: the error colour stays Spindle&apos;s under every brand.
            </p>
          </div>
        </div>
        <footer className="border-t border-border bg-surface px-4 py-3 text-label text-text-muted">{BASE_ATTRIBUTION}</footer>
      </article>
      <details className="rounded-card border border-border bg-surface text-label">
        <summary className="flex min-h-11 cursor-pointer items-center px-3 font-medium">
          Contrast checks: {checks.filter((c) => c.pass).length} of {checks.length} pass · font {TENANT_FONTS[theme.font].label}
        </summary>
        <table className="w-full border-t border-border text-left">
          <thead className="text-text-muted">
            <tr>
              <th className="px-3 py-1 font-medium">Pair</th>
              <th className="px-3 py-1 font-medium">State</th>
              <th className="px-3 py-1 text-right font-medium">Ratio</th>
            </tr>
          </thead>
          <tbody>
            {checks.map((c) => (
              <tr key={`${c.role}-${c.state}`} className="border-t border-border">
                <td className="px-3 py-1">{c.role}</td>
                <td className="px-3 py-1">{c.state}</td>
                <td className="px-3 py-1 text-right font-mono text-code">
                  {c.ratio.toFixed(2)}:1 {c.pass ? "pass" : "FAIL"} (needs {c.minimum})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

export function BrandPreview() {
  const brands = [OXBLOOD, SAGE].map((b) => validateTheme(b));
  const refused = validateTheme(LIGHT_SAGE);
  return (
    <div id="brand-preview" className="flex flex-col gap-6">
      <p className="text-label text-text-muted">
        Two hypothetical brands, no real gym or logo. Only the tenant layer changes: the mark, one accent (links, the current lesson, selected
        controls and the focus ring) and the heading font. Every pair and state is checked against WCAG 2.2 AA before a brand can apply.
      </p>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {brands.map((r) => (r.ok ? <BrandFrame key={r.theme.name} theme={r.theme} checks={r.checks} /> : null))}
      </div>
      {!refused.ok ? (
        <div data-brand-refused className="flex flex-col gap-2 rounded-card bg-surface-muted p-4 text-label">
          <p className="font-medium text-text">Refused: {LIGHT_SAGE.name}, accent {LIGHT_SAGE.accent}</p>
          <ul className="flex list-disc flex-col gap-0.5 pl-5 text-text-muted">
            {refused.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

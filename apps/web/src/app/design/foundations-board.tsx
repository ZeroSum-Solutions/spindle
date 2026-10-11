import { OctagonAlert } from "lucide-react";
import { contrast, validateBrand } from "@spindle/engine";
import { HARBOR, OXBLOOD, PALE_SAGE } from "../../lib/theme/preview-brands";
import { SpindleSymbol, SpindleWordmark } from "../../components/brand-mark/wordmark";
import { CHECKED_PAIRS, PALETTE, RADII, SHADOWS, SPACING, TYPE_SCALE, tokenValue, type KitTheme } from "../../lib/theme/foundations";
import { ThemePair } from "./kit";

// The Lab foundations, rendered with the real tokens. Development only (the /design route).

const TYPE_CLASS: Record<(typeof TYPE_SCALE)[number]["token"], string> = {
  display: "text-display",
  title: "text-title",
  heading: "text-heading",
  "heading-lesson": "text-heading-lesson",
  section: "text-section",
  subhead: "text-subhead",
  reading: "text-reading",
  ui: "text-ui",
  label: "text-label",
  eyebrow: "text-eyebrow",
  code: "text-code",
};
const RADIUS_CLASS: Record<(typeof RADII)[number][0], string> = { small: "rounded-small", control: "rounded-control", card: "rounded-card", plate: "rounded-plate", pill: "rounded-pill" };
const SHADOW_CLASS: Record<(typeof SHADOWS)[number], string> = { raise: "shadow-raise", float: "shadow-float" };
const shown = (r: number) => (Math.floor(r * 100) / 100).toFixed(2);

export function LogoBoard() {
  return (
    <div data-kit-logo className="flex flex-col gap-block">
      <ThemePair>
        <div className="flex flex-col gap-block">
          <SpindleWordmark height={56} label="Spindle wordmark" className="text-text" />
          <div className="flex flex-wrap items-end gap-block">
            {[24, 32].map((h) => (
              <figure key={h} className="flex flex-col gap-tight">
                <SpindleWordmark height={h} label={`Spindle wordmark, ${h}px tall`} className="text-text" />
                <figcaption className="text-eyebrow text-text-muted">{h}px{h === 24 ? " · minimum" : ""}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </ThemePair>
      <div className="flex flex-wrap items-end gap-group">
        <figure className="flex flex-col gap-tight">
          <span className="flex items-end gap-stack">
            {[16, 32, 180].map((s) => (
              // eslint-disable-next-line @next/next/no-img-element -- static brand SVG
              <img key={s} src={s < 48 ? "/brand/spindle-symbol-small.svg" : "/brand/spindle-symbol.svg"} alt={`Spindle symbol at ${s}px`} width={s} height={s} />
            ))}
          </span>
          <figcaption className="text-eyebrow text-text-muted">Favicon and app icon · 16 · 32 · 180</figcaption>
        </figure>
        <figure className="flex flex-col gap-tight">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand SVG */}
          <img src="/brand/spindle-symbol-graphite.svg" alt="Spindle symbol on the graphite tile" width={96} height={96} />
          <figcaption className="text-eyebrow text-text-muted">Graphite tile</figcaption>
        </figure>
        <figure className="flex flex-col gap-tight text-signal">
          <SpindleSymbol size={96} label="Spindle symbol in signal magenta" />
          <figcaption className="text-eyebrow text-text-muted">Bare symbol</figcaption>
        </figure>
      </div>
      <p className="max-w-[66ch] text-label text-text-muted">
        Archivo at weight 900 and its widest width. Both cuts rise 1 in 2 and run parallel: through the d ascender and the square i dot; the l stays solid.
        Boolean geometry from the font&apos;s outlines (docs/design/spindle/build-wordmark.py), not traced. The symbol is the cut d; the favicon doubles the
        cut so it stays open at 16px.
      </p>
    </div>
  );
}

function SwatchList({ theme }: { theme: KitTheme }) {
  return (
    <ul className="grid grid-cols-1 gap-stack sm:grid-cols-2">
      {PALETTE.map((c) => (
        <li key={c.token} data-swatch={c.token} className="flex items-start gap-attach">
          <span aria-hidden className="size-11 shrink-0 rounded-control border border-border" style={{ background: c[theme] }} />
          <span className="flex min-w-0 flex-col">
            <span className="text-ui font-semibold text-text">{c.token}</span>
            <span className="text-code text-text-muted">{c[theme].toUpperCase()}</span>
            <span className="text-label text-text-muted">{c.role}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ColourBoard() {
  return (
    <div data-kit-colour className="grid grid-cols-1 gap-stack lg:grid-cols-2">
      {(["light", "dark"] as const).map((theme) => (
        <div key={theme} data-theme-pane={theme} className={`theme-scope theme-scope-${theme} flex min-w-0 flex-col gap-block rounded-card border border-border bg-canvas p-stack text-text md:p-block`}>
          <p className="text-eyebrow text-text-muted">Lab {theme === "light" ? "Light" : "Dark"}</p>
          <SwatchList theme={theme} />
          <PairTable theme={theme} />
        </div>
      ))}
    </div>
  );
}

function PairTable({ theme }: { theme: KitTheme }) {
  return (
    <table className="w-full border-collapse text-label">
      <caption className="mb-tight text-left text-eyebrow text-text-muted">Checked pairs (WCAG 2.2, exact ratio, rounded down)</caption>
      <thead>
        <tr className="border-b border-border text-left">
          <th className="py-tight pr-stack font-semibold">Pair</th>
          <th className="py-tight pr-stack font-semibold">Ratio</th>
          <th className="py-tight font-semibold">Needs</th>
        </tr>
      </thead>
      <tbody>
        {CHECKED_PAIRS.map(([fg, bg, min]) => (
          <tr key={`${fg}-${bg}`} data-pair={`${theme}:${fg}:${bg}`} className="border-b border-border">
            <td className="py-tight pr-stack">
              {fg} on {bg}
            </td>
            <td className="tabular py-tight pr-stack text-code">{shown(contrast(tokenValue(fg, theme), tokenValue(bg, theme)))}:1</td>
            <td className="tabular py-tight text-code">{min}:1</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TypeBoard() {
  return (
    <ol data-kit-type className="flex flex-col">
      {TYPE_SCALE.map((t) => (
        <li key={t.token} data-type-step={t.token} className="flex flex-col gap-tight border-t border-border py-stack">
          <span className="text-eyebrow text-text-muted">
            {t.token} · {t.phone} → {t.desktop} · {t.note}
          </span>
          <span className={`${TYPE_CLASS[t.token]} min-w-0 text-text`}>{t.sample}</span>
        </li>
      ))}
    </ol>
  );
}

export function TokensBoard() {
  return (
    <div data-kit-tokens className="flex flex-col gap-group">
      <ul className="flex flex-col gap-tight">
        {SPACING.map(([name, phone, desktop]) => (
          <li key={name} className="grid grid-cols-[8rem_1fr] items-center gap-stack">
            <span className="text-code text-text">
              {name} {phone}
              {phone !== desktop ? `/${desktop}` : ""}
            </span>
            <span aria-hidden className="h-3 bg-ink" style={{ width: `var(--spacing-${name})` }} />
          </li>
        ))}
      </ul>
      <ThemePair>
        <div className="flex flex-wrap gap-block">
          {RADII.map(([name, v]) => (
            <figure key={name} className="flex flex-col items-center gap-tight">
              <span aria-hidden className={`size-14 border-2 border-control bg-surface ${RADIUS_CLASS[name]}`} />
              <figcaption className="text-code text-text-muted">
                {name} {v === "9999px" ? "pill" : v}
              </figcaption>
            </figure>
          ))}
          {SHADOWS.map((s) => (
            <figure key={s} className="flex flex-col items-center gap-tight">
              <span aria-hidden className={`size-14 rounded-card bg-surface ${SHADOW_CLASS[s]}`} />
              <figcaption className="text-code text-text-muted">shadow-{s}</figcaption>
            </figure>
          ))}
        </div>
        <p className="max-w-[66ch] text-label text-text-muted">
          Reading measure: <span className="text-code">66ch</span> of Plex Sans at the reading size. A lesson column may be wider for figures; its prose keeps
          the measure.
        </p>
      </ThemePair>
    </div>
  );
}

/** The measurement layer: ticks, a mono readout, numeric progress and segments (done ink, current signal, rest hairline). */
export function MeasurementSpecimen({ done = 2, total = 8 }: { done?: number; total?: number }) {
  const pct = Math.round((done / total) * 100);
  return (
    <div data-measure className="flex flex-col gap-attach">
      <div aria-hidden className="measure-ticks h-5 w-full max-w-md text-control" />
      <div className="flex items-center gap-attach">
        <span className="tabular text-code text-text">
          {String(done + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </span>
        <span role="img" aria-label={`Lesson ${done + 1} of ${total}; ${done} done`} className="grid flex-1 gap-1" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={`h-1.5 rounded-[1px] ${i < done ? "measure-done" : i === done ? "measure-current" : "measure-rest"}`} />
          ))}
        </span>
        <span className="tabular text-code text-text-muted">{pct}%</span>
      </div>
    </div>
  );
}

/**
 * Stop and refer, as tokens (the full safety component lands with the learner screens, M3): inverted
 * against its surroundings in each theme, with the red stop stripe. Never animated. Specimen copy only.
 */
export function StopReferSpecimen() {
  return (
    <aside data-stop-refer className="flex overflow-hidden rounded-card bg-stop-panel text-on-stop-panel">
      <span aria-hidden className="w-2 shrink-0 bg-stop" />
      <div className="flex flex-col gap-attach p-block">
        <p className="flex items-center gap-tight text-eyebrow">
          <OctagonAlert aria-hidden strokeWidth={2} className="size-4" />
          Stop and refer
        </p>
        <p className="text-ui font-semibold">Specimen text: when to stop and refer.</p>
        <p className="text-label text-stop-panel-muted">Specimen text. The real panel shows Spindle&apos;s reviewed safety copy only.</p>
      </div>
    </aside>
  );
}

/** Automatic checks the kit can show live: theme pairs, the brand fixtures in both themes. */
export function ChecksBoard() {
  const themes = ["light", "dark"] as const;
  const pairResults = themes.flatMap((t) => CHECKED_PAIRS.map(([fg, bg, min]) => contrast(tokenValue(fg, t), tokenValue(bg, t)) >= min));
  const examples = [OXBLOOD, HARBOR, PALE_SAGE].map((b) => validateBrand(b));
  const passing = examples.filter((r) => r.ok).length;
  return (
    <ul data-kit-checks className="flex flex-col divide-y divide-border rounded-card border border-border bg-surface text-label">
      <li className="flex flex-wrap items-baseline justify-between gap-tight p-stack">
        <span className="text-text">Kit colour pairs, light and dark</span>
        <span className="tabular text-code text-text">
          {pairResults.filter(Boolean).length} / {pairResults.length} pass
        </span>
      </li>
      <li className="flex flex-wrap items-baseline justify-between gap-tight p-stack">
        <span className="text-text">Example gym brands through the real validator, both themes (the shared engine and SQL fixtures run in CI)</span>
        <span className="tabular text-code text-text">
          {passing} accepted · {examples.length - passing} refused · {examples.reduce((n, r) => n + r.checks.length, 0)} checks
        </span>
      </li>
      <li className="flex flex-col gap-hair p-stack">
        <span className="text-text">Browser checks (Playwright, e2e/theme.spec.ts)</span>
        <span className="text-text-muted">
          axe WCAG 2.2 AA and computed contrast in Lab Light and Lab Dark at 320, 390 and 1440px; the toggle persists across reloads; the stored theme is on
          &lt;html&gt; before first paint.
        </span>
      </li>
    </ul>
  );
}

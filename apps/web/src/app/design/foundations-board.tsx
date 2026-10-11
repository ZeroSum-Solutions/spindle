import { contrast } from "@spindle/engine";
import { Eyebrow } from "../../components/ui";
import { CHECKED_PAIRS, PALETTE, RADII, SHADOWS, SPACING, TYPE_SCALE } from "../../lib/theme/foundations";
import { MotionTokens } from "./motion-tokens";

const TYPE_CLASS: Record<(typeof TYPE_SCALE)[number]["token"], string> = {
  display: "text-display",
  title: "text-title",
  heading: "text-heading",
  section: "text-section",
  subhead: "text-subhead",
  reading: "text-reading",
  ui: "text-ui",
  label: "text-label",
  eyebrow: "text-eyebrow",
};
const RADIUS_CLASS: Record<(typeof RADII)[number][0], string> = { small: "rounded-small", control: "rounded-control", card: "rounded-card", plate: "rounded-plate", pill: "rounded-pill" };
const SHADOW_CLASS: Record<(typeof SHADOWS)[number], string> = { raise: "shadow-raise", float: "shadow-float", print: "shadow-print" };

/** The Pressroom foundations, rendered with the real tokens. Development only (the /design route). */
export function FoundationsBoard() {
  return (
    <div data-foundations className="flex flex-col gap-section">
      <section aria-labelledby="f-brand" className="flex flex-col gap-block">
        <div className="flex flex-col gap-tight">
          <Eyebrow>01 / 06 · Brand</Eyebrow>
          <h2 id="f-brand" className="text-section">The Cut, Pressroom redraw</h2>
        </div>
        <div className="flex flex-col gap-group bg-signal p-block text-white md:p-group">
          <div className="flex flex-wrap items-end gap-group">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand SVG */}
            <img src="/brand/spindle-wordmark-white.svg" alt="Spindle wordmark, reversed on Pressroom Blue" width={240} height={81} />
            <p className="max-w-[40ch] text-label text-white/90">The cut rises 1 in 2 through the d ascender and the disc of the i; the l stays solid. Drawn from Archivo&apos;s outlines, not traced.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-group">
          {[120, 160, 240].map((w) => (
            <figure key={w} className="flex flex-col gap-tight">
              {/* eslint-disable-next-line @next/next/no-img-element -- static brand SVG */}
              <img src="/brand/spindle-wordmark-ink.svg" alt={`Spindle wordmark at ${w}px wide`} width={w} height={Math.round(w / 2.9533)} />
              <figcaption className="text-eyebrow text-text-muted">{w}px</figcaption>
            </figure>
          ))}
          <figure className="flex flex-col gap-tight">
            <span className="flex items-end gap-stack">
              {[16, 32, 180].map((s) => (
                // eslint-disable-next-line @next/next/no-img-element -- static brand SVG
                <img key={s} src={s < 48 ? "/brand/spindle-symbol-small.svg" : "/brand/spindle-symbol.svg"} alt={`Spindle symbol at ${s}px`} width={s} height={s} />
              ))}
            </span>
            <figcaption className="text-eyebrow text-text-muted">Symbol 16 · 32 · 180</figcaption>
          </figure>
        </div>
      </section>

      <section aria-labelledby="f-colour" className="flex flex-col gap-block">
        <div className="flex flex-col gap-tight">
          <Eyebrow>02 / 06 · Colour</Eyebrow>
          <h2 id="f-colour" className="text-section">Bone, ink and one spot colour</h2>
        </div>
        <ul className="grid grid-cols-1 gap-stack sm:grid-cols-2 lg:grid-cols-3">
          {PALETTE.map((c) => (
            <li key={c.token} data-swatch={c.token} className="flex items-start gap-attach">
              <span aria-hidden className="size-12 shrink-0 rounded-card border border-border" style={{ background: c.hex }} />
              <span className="flex flex-col">
                <span className="text-ui font-semibold">{c.token}</span>
                <span className="text-code text-text-muted">{c.hex.toUpperCase()}</span>
                <span className="text-label text-text-muted">{c.role}</span>
              </span>
            </li>
          ))}
        </ul>
        <table className="w-full border-collapse text-label">
          <caption className="mb-tight text-left text-eyebrow text-text-muted">Checked pairs (WCAG 2.2, exact ratio)</caption>
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-tight pr-stack font-semibold">Foreground</th>
              <th className="py-tight pr-stack font-semibold">Background</th>
              <th className="py-tight pr-stack font-semibold">Ratio</th>
              <th className="py-tight font-semibold">Needs</th>
            </tr>
          </thead>
          <tbody>
            {CHECKED_PAIRS.map(([f, fg, b, bg, min]) => (
              <tr key={`${f}-${b}`} className="border-b border-border">
                <td className="py-tight pr-stack">{f}</td>
                <td className="py-tight pr-stack">{b}</td>
                <td className="tabular py-tight pr-stack text-code">{(Math.floor(contrast(fg, bg) * 100) / 100).toFixed(2)}:1</td>
                <td className="tabular py-tight text-code">{min}:1</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="f-type" className="flex flex-col gap-block">
        <div className="flex flex-col gap-tight">
          <Eyebrow>03 / 06 · Type</Eyebrow>
          <h2 id="f-type" className="text-section">Archivo, Newsreader, IBM Plex Mono</h2>
        </div>
        <ol className="flex flex-col">
          {TYPE_SCALE.map((t) => (
            <li key={t.token} data-type-step={t.token} className="flex flex-col gap-tight border-t border-border py-stack">
              <span className="text-eyebrow text-text-muted">
                {t.token} · {t.phone} → {t.desktop} · {t.note}
              </span>
              <span className={`${TYPE_CLASS[t.token]} min-w-0 [overflow-wrap:anywhere]`}>{t.sample}</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="f-space" className="flex flex-col gap-block">
        <div className="flex flex-col gap-tight">
          <Eyebrow>04 / 06 · Spacing</Eyebrow>
          <h2 id="f-space" className="text-section">An 8-point scale with names</h2>
        </div>
        <ul className="flex flex-col gap-tight">
          {SPACING.map(([name, phone, desktop]) => (
            <li key={name} className="grid grid-cols-[7rem_1fr] items-center gap-stack">
              <span className="text-code">
                {name} {phone}
                {phone !== desktop ? `/${desktop}` : ""}
              </span>
              <span aria-hidden className="h-3 bg-ink" style={{ width: `var(--spacing-${name})` }} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="f-shape" className="flex flex-col gap-block">
        <div className="flex flex-col gap-tight">
          <Eyebrow>05 / 06 · Shape and depth</Eyebrow>
          <h2 id="f-shape" className="text-section">Sharp corners, flat surfaces</h2>
        </div>
        <div className="flex flex-wrap gap-block">
          {RADII.map(([name, v]) => (
            <figure key={name} className="flex flex-col items-center gap-tight">
              <span aria-hidden className={`size-16 border-2 border-ink bg-surface ${RADIUS_CLASS[name]}`} />
              <figcaption className="text-code text-text-muted">
                {name} {v === "9999px" ? "pill" : v}
              </figcaption>
            </figure>
          ))}
          {SHADOWS.map((s) => (
            <figure key={s} className="flex flex-col items-center gap-tight">
              <span aria-hidden className={`size-16 rounded-card bg-surface ${SHADOW_CLASS[s]}`} />
              <figcaption className="text-code text-text-muted">shadow-{s}</figcaption>
            </figure>
          ))}
        </div>
        <div className="flex flex-col gap-tight">
          <span className="text-eyebrow text-text-muted">Measurement layer</span>
          <div aria-hidden className="measure-ticks h-6 w-full max-w-md text-text-muted" />
          <div className="flex items-center gap-attach">
            <span className="tabular text-code">03 / 08</span>
            <span aria-hidden className="grid flex-1 grid-cols-8 gap-1">
              {Array.from({ length: 8 }, (_, i) => (
                <span key={i} className={`h-1.5 ${i < 2 ? "bg-ink" : i === 2 ? "measure-current" : "bg-surface-muted"}`} />
              ))}
            </span>
          </div>
        </div>
      </section>

      <section aria-labelledby="f-motion" className="flex flex-col gap-block">
        <div className="flex flex-col gap-tight">
          <Eyebrow>06 / 06 · Motion</Eyebrow>
          <h2 id="f-motion" className="text-section">Decisive, never in the way</h2>
        </div>
        <MotionTokens />
      </section>
    </div>
  );
}

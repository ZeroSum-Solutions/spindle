import type { BrandFont } from "@spindle/schema";
import { ATLAS, contrast, mix } from "@spindle/engine";
import { tenantFontClass } from "@/lib/theme/fonts";

// P4-A2 design-contract specimen (development only). It shows the tenant band, the catalog hero and
// the pattern covers that DESIGN.md now specifies, drawn from the derivation rules with live WCAG
// ratios. These are token specimens, not the planned components (BrandHeader, CatalogHero,
// CourseCover come later in P4-A2). Synthetic brands, text marks only (spec section 7).

type Pattern = "solid" | "diagonal" | "grid" | "dots" | "rings" | "waves";
type Tone = "accent" | "band" | "soft";

interface Specimen {
  name: string;
  font: BrandFont;
  accent: string;
  onAccent: string;
  band: string;
  headline: string;
  tagline: string;
  chips: string[];
  covers: { title: string; pattern: Pattern; tone: Tone }[];
}

const SPECIMENS: Specimen[] = [
  {
    name: "Example Strength Club",
    font: "barlow-condensed",
    accent: "#7a1b26",
    onAccent: "#ffffff",
    band: "#17232b",
    headline: "Lift well. Coach better.",
    tagline: "Our method for teaching the barbell.",
    chips: ["Strength", "Powerlifting"],
    covers: [
      { title: "Squat pattern coaching", pattern: "diagonal", tone: "band" },
      { title: "Program design basics", pattern: "grid", tone: "accent" },
    ],
  },
  {
    name: "Example Pilates Studio",
    font: "fraunces",
    accent: "#2f6b57",
    onAccent: "#ffffff",
    band: "#e8efe6",
    headline: "Move with intention.",
    tagline: "Teaching notes from our studio for instructors.",
    chips: ["Pilates", "Mobility"],
    covers: [
      { title: "Reformer cueing", pattern: "waves", tone: "soft" },
      { title: "Breath and ribcage", pattern: "rings", tone: "accent" },
    ],
  },
];

/** DESIGN.md › Colors: on-band is ink or white, whichever is higher; tint and edge mix it 12% and 20% into the band. */
function bandTokens(band: string) {
  const onBand = contrast(ATLAS.ink, band) >= contrast("#ffffff", band) ? ATLAS.ink : "#ffffff";
  return { band, onBand, bandTint: mix(band, onBand, 0.12), bandEdge: mix(band, onBand, 0.2) };
}

const shown = (ratio: number) => Math.floor(ratio * 100) / 100;

function Ratio({ label, fg, bg, min, unused = false }: { label: string; fg: string; bg: string; min: number; unused?: boolean }) {
  const r = contrast(fg, bg);
  const pass = r >= min;
  const result = unused ? "not drawn (accent never sits on the band)" : pass ? `pass (${min}:1)` : `refused (needs ${min}:1)`;
  return (
    <tr className="border-t border-border">
      <td className="py-1.5 pr-3">{label}</td>
      <td className="py-1.5 pr-3 font-mono text-code">
        {fg} / {bg}
      </td>
      <td className="py-1.5 pr-3 font-mono text-code">{shown(r).toFixed(2)}:1</td>
      <td className="py-1.5 font-medium">{result}</td>
    </tr>
  );
}

/** A Spindle-drawn 16:9 pattern cover. Decorative: empty alt, no text. */
export function PatternCover({ pattern, tone, accent, onAccent, band }: { pattern: Pattern; tone: Tone; accent: string; onAccent: string; band: string }) {
  const t = bandTokens(band);
  const fill = tone === "accent" ? accent : tone === "band" ? band : mix(accent, "#ffffff", 0.9);
  const stroke = tone === "accent" ? onAccent : tone === "band" ? t.onBand : accent;
  const lines = { stroke, strokeOpacity: 0.18, strokeWidth: 2, fill: "none" } as const;
  return (
    <svg viewBox="0 0 320 180" role="presentation" aria-hidden className="block aspect-video w-full rounded-t-card" data-pattern={pattern} data-tone={tone}>
      <rect width="320" height="180" fill={fill} />
      {pattern === "diagonal" && Array.from({ length: 14 }, (_, i) => <path key={i} d={`M${i * 32 - 180} 180 L${i * 32} 0`} {...lines} />)}
      {pattern === "grid" && (
        <>
          {Array.from({ length: 11 }, (_, i) => <path key={`v${i}`} d={`M${i * 32} 0 V180`} {...lines} />)}
          {Array.from({ length: 6 }, (_, i) => <path key={`h${i}`} d={`M0 ${i * 32} H320`} {...lines} />)}
        </>
      )}
      {pattern === "dots" && Array.from({ length: 60 }, (_, i) => <circle key={i} cx={16 + (i % 10) * 32} cy={16 + Math.floor(i / 10) * 32} r={3} fill={stroke} fillOpacity={0.18} />)}
      {pattern === "rings" && Array.from({ length: 6 }, (_, i) => <circle key={i} cx={240} cy={150} r={30 + i * 34} {...lines} />)}
      {pattern === "waves" && Array.from({ length: 7 }, (_, i) => <path key={i} d={`M0 ${20 + i * 26} C 80 ${i * 26} 160 ${40 + i * 26} 320 ${20 + i * 26}`} {...lines} />)}
    </svg>
  );
}

export function BrandPresenceBoard() {
  return (
    <div id="brand-presence-board" className="flex flex-col gap-10">
      <p className="text-label text-text-muted">
        Token specimens for the P4-A2 contract (DESIGN.md › Colors, Layout, Brand). The ratios are computed here from the same derivation the validator will use; the
        unrounded ratio decides, and the numbers are shown rounded down. Synthetic brands, text marks only.
      </p>
      {SPECIMENS.map((s) => {
        const t = bandTokens(s.band);
        const font = tenantFontClass(s.font);
        return (
          <article key={s.name} className={`flex flex-col gap-4 ${font.className}`} data-band-specimen={s.name}>
            <h3 className="text-lg font-medium text-text">{s.name}</h3>
            {/* Header band and catalog hero on one band colour. Focus ring here is on-band. */}
            <div style={{ background: t.band, color: t.onBand, ["--focus-ring" as string]: t.onBand }} className="overflow-hidden rounded-card">
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3" style={{ borderBottom: `1px solid ${t.bandEdge}` }}>
                <span className="text-[20px] font-semibold [overflow-wrap:anywhere]" style={{ fontFamily: font.family }}>
                  {s.name}
                </span>
                <nav aria-label={`${s.name} sample links`} className="flex gap-4">
                  {["Courses", "About"].map((l) => (
                    <a key={l} href="#brand-presence-board" className="inline-flex min-h-11 items-center text-label font-medium underline underline-offset-4 hover:decoration-2">
                      {l}
                    </a>
                  ))}
                </nav>
              </div>
              <div className="flex flex-col gap-3 px-4 py-8 md:px-8">
                <p className="text-display font-semibold" style={{ fontFamily: font.family }}>
                  {s.headline}
                </p>
                <p className="text-reading">{s.tagline}</p>
                <ul className="flex flex-wrap gap-2" aria-label="Modalities">
                  {s.chips.map((c) => (
                    <li key={c} className="rounded-small px-2 py-0.5 text-label font-medium" style={{ background: t.bandTint }}>
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {s.covers.map((c) => (
                <figure key={c.title} className="overflow-hidden rounded-card border border-border bg-surface">
                  <PatternCover pattern={c.pattern} tone={c.tone} accent={s.accent} onAccent={s.onAccent} band={s.band} />
                  <figcaption className="flex flex-col gap-1 p-4">
                    <span className="text-[20px] font-semibold text-text" style={{ fontFamily: font.family }}>
                      {c.title}
                    </span>
                    <span className="font-mono text-code text-text-muted">
                      {c.pattern} / {c.tone}
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
            <table className="w-full text-left text-label text-text">
              <caption className="pb-2 text-left font-medium">Checked pairs for {s.name}</caption>
              <thead className="text-text-muted">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Role</th>
                  <th className="py-1.5 pr-3 font-medium">Foreground / background</th>
                  <th className="py-1.5 pr-3 font-medium">Ratio</th>
                  <th className="py-1.5 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                <Ratio label="Header name, nav link, hero text" fg={t.onBand} bg={t.band} min={4.5} />
                <Ratio label="Focus ring on the band" fg={t.onBand} bg={t.band} min={3} />
                <Ratio label="Hero chip" fg={t.onBand} bg={t.bandTint} min={4.5} />
                <Ratio label="Accent link on surface" fg={s.accent} bg={ATLAS.surface} min={4.5} />
                <Ratio label="Card focus ring (accent on canvas)" fg={s.accent} bg={ATLAS.canvas} min={3} />
                <Ratio label="Accent on the band" fg={s.accent} bg={t.band} min={4.5} unused />
              </tbody>
            </table>
          </article>
        );
      })}
      <div className="flex flex-col gap-3">
        <h3 className="text-lg font-medium text-text">All patterns, default band</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(["solid", "diagonal", "grid", "dots", "rings", "waves"] as const).map((p) => (
            <figure key={p} className="overflow-hidden rounded-card border border-border">
              <PatternCover pattern={p} tone="soft" accent="#2453d4" onAccent="#ffffff" band={ATLAS.surface} />
              <figcaption className="px-3 py-2 font-mono text-code text-text-muted">{p} / soft</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
}

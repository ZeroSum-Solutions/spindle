import { useId } from "react";

// Original line art (Spindle, AI-assisted, CC BY-SA 4.0; provenance in
// docs/design/spindle/asset-provenance.json). Three course layers as stacked sheets.
// The sheets lean along the wordmark's 12-degree cut: each side's run is 0.2126 x its height.

const H = 64;
const RUN = Math.round(H * 0.2126 * 10) / 10;
const W = 280;

const STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinejoin: "round", vectorEffect: "non-scaling-stroke" } as const;

// Each sheet's label stays in the drawing at a size that is still 16px at a 320px screen;
// the notes are HTML text at the label size, so they never shrink with the drawing.
const SHEETS = [
  { x: 64, y: 24, label: "Gym method", note: "Your cues, your system, your name", fill: "var(--color-brand-soft)" },
  { x: 36, y: 100, label: "Modality", note: "Strength, speed, mobility, yoga…", fill: "var(--color-surface)" },
  { x: 8, y: 176, label: "Base", note: "How the body works, with cited science", fill: "var(--color-surface)" },
] as const;

function Sheet({ x, y, label, fill }: { x: number; y: number; label: string; fill: string }) {
  const points = `${x + RUN},${y} ${x + W + RUN},${y} ${x + W},${y + H} ${x},${y + H}`;
  return (
    <g>
      <polygon points={points} {...STROKE} style={{ fill }} />
      <text x={x + 28} y={y + H / 2 + 7} fontSize={20} fontWeight={500} fill="currentColor">
        {label}
      </text>
    </g>
  );
}

/** Base, modality and method as stacked, separately labelled course layers; the method sheet carries the accent. */
export function LayerStack({ brandName }: { brandName: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-4">
      <svg viewBox="0 0 360 260" role="img" aria-labelledby={`${id}-t ${id}-d`} className="h-auto w-full text-ink">
        <title id={`${id}-t`}>Three layers of courses</title>
        <desc id={`${id}-d`}>
          {`Three stacked sheets. At the bottom, the ${brandName} base: how the body works, with cited science. In the middle, a modality layer such as strength or mobility. On top, highlighted, your gym's own method.`}
        </desc>
        {[...SHEETS].reverse().map((sheet) => (
          <Sheet key={sheet.label} x={sheet.x} y={sheet.y} label={sheet.label} fill={sheet.fill} />
        ))}
      </svg>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-label sm:grid-cols-[auto_1fr]">
        {SHEETS.map((sheet) => (
          <div key={sheet.label} className="contents">
            <dt className="font-medium text-text">{sheet.label}</dt>
            <dd className="text-text-muted">{sheet.note}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

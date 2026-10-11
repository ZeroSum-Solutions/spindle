import { useId } from "react";

// Original line art (Spindle, AI-assisted, CC BY-SA 4.0; provenance in
// docs/design/spindle/asset-provenance.json). Three course layers as stacked sheets.
// The sheets lean along the wordmark's 12-degree cut: each side's run is 0.2126 x its height.

const H = 64;
const RUN = Math.round(H * 0.2126 * 10) / 10;
const W = 280;

const STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinejoin: "round", vectorEffect: "non-scaling-stroke" } as const;

function Sheet({ x, y, label, note, fill }: { x: number; y: number; label: string; note: string; fill: string }) {
  const points = `${x + RUN},${y} ${x + W + RUN},${y} ${x + W},${y + H} ${x},${y + H}`;
  return (
    <g>
      <polygon points={points} {...STROKE} style={{ fill }} />
      <text x={x + 24} y={y + 28} fontSize={17} fontWeight={500} fill="currentColor">
        {label}
      </text>
      <text x={x + 24} y={y + 49} fontSize={13} fill="var(--color-text-muted)">
        {note}
      </text>
    </g>
  );
}

/** Base, modality and method as stacked, separately labelled course layers; the method sheet carries the accent. */
export function LayerStack({ brandName }: { brandName: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 360 260" role="img" aria-labelledby={`${id}-t ${id}-d`} className="h-auto w-full text-ink">
      <title id={`${id}-t`}>Three layers of courses</title>
      <desc id={`${id}-d`}>
        {`Three stacked sheets. At the bottom, the ${brandName} base: how the body works, with cited science. In the middle, a modality layer such as strength or mobility. On top, highlighted, your gym's own method.`}
      </desc>
      <Sheet x={8} y={176} label="Base" note="How the body works · cited science" fill="var(--color-surface)" />
      <Sheet x={36} y={100} label="Modality" note="Strength, speed, mobility, yoga…" fill="var(--color-surface)" />
      <Sheet x={64} y={24} label="Gym method" note="Your cues, your system, your name" fill="var(--color-brand-soft)" />
    </svg>
  );
}

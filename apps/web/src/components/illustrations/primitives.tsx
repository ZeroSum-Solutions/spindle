import { useId, type ReactNode } from "react";

// Shared drawing primitives for Spindle's original line art (AI-assisted, CC BY-SA 4.0;
// provenance in docs/design/spindle/asset-provenance.json). Lucide-style strokes: 1.75px at
// any size, round caps and joins, ink lines, one accent fill on what the lesson is about.
//
// Contract: a drawing carries geometry and marker numbers only. Every word (the SVG title
// and description, the legend) is passed in by the caller, so lesson text stays in the
// lesson and is reviewed and versioned with it.

export const STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round", vectorEffect: "non-scaling-stroke" } as const;
export const CONTEXT = { ...STROKE, stroke: "var(--color-control)" } as const;
export const GHOST = { ...STROKE, strokeDasharray: "4 5" } as const;
export const ACCENT_FILL = { fill: "var(--color-brand-soft)" } as const;
export const SURFACE_FILL = { fill: "var(--color-surface)" } as const;

export interface DrawingText {
  /** Short accessible name of the drawing, from the lesson. */
  title: string;
  /** Full text alternative, from the lesson. */
  description: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface Marker extends Point {
  n: number;
}

export function Svg({ title, description, width, height, children }: DrawingText & { width: number; height: number; children: ReactNode }) {
  const id = useId();
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-t ${id}-d`} className="h-auto w-full text-ink">
      <title id={`${id}-t`}>{title}</title>
      <desc id={`${id}-d`}>{description}</desc>
      {children}
    </svg>
  );
}

/**
 * Numbered markers as HTML over the drawing, so the numbers stay at the 14px label size at
 * every width instead of shrinking with the SVG. Numbers only: the legend gives the words.
 */
export function Markers({ markers, width, height }: { markers: readonly Marker[]; width: number; height: number }) {
  return (
    <>
      {markers.map(({ n, x, y }) => (
        <span
          key={n}
          aria-hidden
          data-marker={n}
          style={{ left: `${(x / width) * 100}%`, top: `${(y / height) * 100}%` }}
          className="absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[1.75px] border-ink bg-surface font-mono text-label font-medium text-ink"
        >
          {n}
        </span>
      ))}
    </>
  );
}

const line = (points: readonly Point[]) => points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");

export interface Pose {
  head: Point;
  /** Base of the neck, where the shoulders hang. */
  neck: Point;
  hip: Point;
  /** Each arm: shoulder, elbow, hand. */
  arms: readonly (readonly [Point, Point, Point])[];
  /** Each leg: hip, knee, foot. */
  legs: readonly (readonly [Point, Point, Point])[];
  /** Arms or legs on the far side, drawn in the context colour behind the near side. */
  farArms?: readonly (readonly [Point, Point, Point])[];
  farLegs?: readonly (readonly [Point, Point, Point])[];
  /** Optional shoulder girdle, drawn as a line through the neck (a figure seen from the front or back). */
  shoulders?: readonly [Point, Point];
  /** Which way the face points in a side view, shown by a small nose mark. */
  facing?: "left" | "right" | "up";
}

export const HEAD_R = 11;

/** A schematic person from joint positions: a head, a spine and jointed limbs. */
export function Person({ pose }: { pose: Pose }) {
  const { head, neck, hip, arms, legs, farArms = [], farLegs = [], shoulders, facing } = pose;
  return (
    <g data-person>
      {farLegs.map((l, i) => (
        <path key={`fl${i}`} d={line(l)} {...CONTEXT} />
      ))}
      {farArms.map((a, i) => (
        <path key={`fa${i}`} d={line(a)} {...CONTEXT} />
      ))}
      <path d={line([neck, hip])} {...STROKE} />
      {shoulders ? <path d={line([shoulders[0], neck, shoulders[1]])} {...STROKE} /> : null}
      {legs.map((l, i) => (
        <path key={`l${i}`} d={line(l)} {...STROKE} />
      ))}
      {arms.map((a, i) => (
        <path key={`a${i}`} d={line(a)} {...STROKE} />
      ))}
      <circle cx={head.x} cy={head.y} r={HEAD_R} {...STROKE} style={SURFACE_FILL} />
      {facing === "right" ? <path d={`M${head.x + HEAD_R} ${head.y - 2} l4 3 l-4 2`} {...STROKE} /> : null}
      {facing === "left" ? <path d={`M${head.x - HEAD_R} ${head.y - 2} l-4 3 l4 2`} {...STROKE} /> : null}
      {facing === "up" ? <path d={`M${head.x - 2} ${head.y - HEAD_R} l3 -4 l2 4`} {...STROKE} /> : null}
    </g>
  );
}

/** A small arrow head at `to`, pointing along the segment from `from`. */
export function ArrowHead({ from, to, size = 7 }: { from: Point; to: Point; size?: number }) {
  const a = Math.atan2(to.y - from.y, to.x - from.x);
  const p = (da: number) => ({ x: to.x - size * Math.cos(a + da), y: to.y - size * Math.sin(a + da) });
  const [l, r] = [p(0.5), p(-0.5)];
  return <path d={`M${l.x.toFixed(1)} ${l.y.toFixed(1)} L${to.x} ${to.y} L${r.x.toFixed(1)} ${r.y.toFixed(1)}`} {...STROKE} />;
}

/** The legend under a drawing: numbered keys, words supplied by the lesson. */
export function NumberedLegend({ items }: { items: readonly string[] }) {
  return (
    <ol className="flex flex-col gap-1 text-label text-text">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="font-mono text-code text-text-muted">{i + 1}</span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

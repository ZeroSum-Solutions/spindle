import { useId, type ReactNode } from "react";
import type { DiagramLegendItem } from "@spindle/schema";

// Shared drawing primitives for Spindle's original line art (AI-assisted, CC BY-SA 4.0;
// provenance in docs/design/spindle/asset-provenance.json). Lucide-style strokes: 1.75px at
// any size, round caps and joins, ink lines, one accent fill on what the lesson is about.
//
// Contract (Sol R16): code holds geometry only. A drawing names its anchors; the lesson's
// diagram block supplies every word (alt text, caption, legend labels and text) and picks
// which anchors are marked by listing their keys in its legend. Nothing a learner reads is
// written here, so all of it is hashed and reviewed with the lesson.

export const STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round", vectorEffect: "non-scaling-stroke" } as const;
export const CONTEXT = { ...STROKE, stroke: "var(--color-control)" } as const;
export const GHOST = { ...STROKE, strokeDasharray: "4 5" } as const;
export const ACCENT_FILL = { fill: "var(--color-brand-soft)" } as const;
export const SURFACE_FILL = { fill: "var(--color-surface)" } as const;

export interface Point {
  x: number;
  y: number;
}

/** A place a legend item can mark: where its number sits, and an optional leader line to the structure. */
export interface Anchor extends Point {
  leader?: { from: Point; to: Point };
}

/** Geometry for one diagram id: its drawing space, its named anchors and its line art. */
export interface DrawingSpec {
  view: { width: number; height: number };
  anchors: Readonly<Record<string, Anchor>>;
  Art: () => ReactNode;
}

/** The legend item of a reviewed diagram block. */
export type LegendItem = DiagramLegendItem;

export interface PlacedMarker extends Anchor {
  n: number;
  key: string;
}

/**
 * The numbered markers for a legend: item i is number i + 1 and sits on the anchor its key
 * names. A key with no anchor in this drawing gets no marker (the legend still lists it).
 */
export function placeMarkers(spec: DrawingSpec, legend: readonly LegendItem[]): PlacedMarker[] {
  return legend.flatMap((item, i) => (Object.hasOwn(spec.anchors, item.key) ? [{ ...spec.anchors[item.key]!, n: i + 1, key: item.key }] : []));
}

/** A drawing with its markers. The SVG's accessible name is the block's alt text. */
export function Drawing({ spec, alt, legend }: { spec: DrawingSpec; alt: string; legend: readonly LegendItem[] }) {
  const id = useId();
  const { width, height } = spec.view;
  const markers = placeMarkers(spec, legend);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-t`} className="h-auto w-full text-ink">
        <title id={`${id}-t`}>{alt}</title>
        <spec.Art />
        {markers.map(({ key, leader }) =>
          leader ? <line key={key} x1={leader.from.x} y1={leader.from.y} x2={leader.to.x} y2={leader.to.y} data-leader={key} {...STROKE} /> : null,
        )}
      </svg>
      {markers.map(({ n, key, x, y }) => (
        <span
          key={key}
          aria-hidden
          data-marker={n}
          data-anchor={key}
          style={{ left: `${(x / width) * 100}%`, top: `${(y / height) * 100}%` }}
          className="absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[1.75px] border-ink bg-surface font-mono text-label font-medium text-ink"
        >
          {n}
        </span>
      ))}
    </div>
  );
}

const line = (points: readonly Point[]) => points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
export type Limb = readonly [Point, Point, Point];
export const P = (x: number, y: number): Point => ({ x, y });

export interface Pose {
  head: Point;
  /** Base of the neck, where the shoulders hang. */
  neck: Point;
  hip: Point;
  /** Each arm: shoulder, elbow, hand. */
  arms: readonly Limb[];
  /** Each leg: hip, knee, foot. */
  legs: readonly Limb[];
  /** Arms or legs on the far side, drawn in the context colour behind the near side. */
  farArms?: readonly Limb[];
  farLegs?: readonly Limb[];
  /** Optional shoulder girdle, drawn as a line through the neck (a figure seen from the front or back). */
  shoulders?: readonly [Point, Point];
  /** Which way the face points in a side view, shown by a small nose mark. */
  facing?: "left" | "right" | "up";
}

export const HEAD_R = 11;

/** A schematic person from joint positions: a head, a spine and jointed limbs. Near arms are drawn over the head. */
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
      <circle cx={head.x} cy={head.y} r={HEAD_R} {...STROKE} style={SURFACE_FILL} />
      {facing === "right" ? <path d={`M${head.x + HEAD_R} ${head.y - 2} l4 3 l-4 2`} {...STROKE} /> : null}
      {facing === "left" ? <path d={`M${head.x - HEAD_R} ${head.y - 2} l-4 3 l4 2`} {...STROKE} /> : null}
      {facing === "up" ? <path d={`M${head.x - 2} ${head.y - HEAD_R} l3 -4 l2 4`} {...STROKE} /> : null}
      {arms.map((a, i) => (
        <path key={`a${i}`} d={line(a)} {...STROKE} />
      ))}
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

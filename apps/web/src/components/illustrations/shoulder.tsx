import { useId, type ReactNode } from "react";

// Original schematic line art (Spindle, AI-assisted, CC BY-SA 4.0; provenance in
// docs/design/spindle/asset-provenance.json). Drawn from simple geometry, not traced
// from any atlas. Lucide-style strokes: 1.75px at any size, round caps and joins, ink
// lines, one accent fill on the structure the lesson is about. Not to scale.

const STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round", vectorEffect: "non-scaling-stroke" } as const;
const CONTEXT = { ...STROKE, stroke: "var(--color-control)" } as const;
const BEHIND = { ...STROKE, strokeDasharray: "4 5" } as const;

function Svg({ title, desc, viewBox, children }: { title: string; desc: string; viewBox: string; children: ReactNode }) {
  const id = useId();
  return (
    <svg viewBox={viewBox} role="img" aria-labelledby={`${id}-t ${id}-d`} className="h-auto w-full text-ink">
      <title id={`${id}-t`}>{title}</title>
      <desc id={`${id}-d`}>{desc}</desc>
      {children}
    </svg>
  );
}

/**
 * Numbered markers, in drawing coordinates. They render as HTML over the drawing, so the
 * numbers stay at the 14px label size at every width instead of shrinking with the SVG.
 */
export const SHOULDER_MARKERS = [
  { n: 1, x: 100, y: 84 },
  { n: 2, x: 290, y: 76 },
  { n: 3, x: 300, y: 136 },
  { n: 4, x: 250, y: 250 },
] as const;
const SHOULDER_VIEW = { width: 440, height: 340 };

/** The shoulder complex, left shoulder from the front (the subject's left): four numbered places, the ball and socket highlighted. */
export function ShoulderComplex() {
  return (
    <div className="relative">
    <Svg
      viewBox={`0 0 ${SHOULDER_VIEW.width} ${SHOULDER_VIEW.height}`}
      title="The shoulder complex, left shoulder seen from the front"
      desc="Schematic line drawing. The collarbone runs from the breastbone to the top of the shoulder blade. The ball at the top of the upper arm bone sits against a shallow socket on the shoulder blade, which lies behind the ribs. Numbers mark the sternoclavicular joint (1), the acromioclavicular joint (2), the glenohumeral ball-and-socket joint (3, highlighted) and the shoulder blade, which lies behind the ribs (4)."
    >
      {/* Ribs and breastbone, for context. */}
      <path d="M66 70 h26 q7 0 7 7 v74 q0 9 -9 11 h-22 q-9 -2 -9 -11 v-74 q0 -7 7 -7 z" {...CONTEXT} />
      <path d="M100 132 C 160 124 214 142 252 182" {...CONTEXT} />
      <path d="M100 166 C 156 160 208 178 240 222" {...CONTEXT} />
      <path d="M96 202 C 148 198 196 216 226 258" {...CONTEXT} />
      <path d="M90 236 C 136 234 178 250 206 290" {...CONTEXT} />
      {/* Shoulder blade, behind the ribs (dashed): its outer border down to the lower tip. */}
      <path d="M316 166 C 306 212 292 252 270 296 C 242 276 220 246 208 214" {...BEHIND} />
      {/* Collarbone: an S-curve from the breastbone to the acromion. */}
      <path d="M100 76 C 140 62 176 86 214 80 S 268 60 290 68" {...STROKE} />
      <path d="M100 92 C 140 78 178 102 216 96 S 270 76 290 84" {...STROKE} />
      <path d="M100 76 q-4 8 0 16" {...STROKE} />
      {/* Acromion: the roof over the ball. */}
      <path d="M288 66 C 318 56 354 64 374 90 C 362 96 332 92 292 86" {...STROKE} />
      {/* Coracoid: the small hook below the collarbone. */}
      <path d="M262 104 C 276 102 290 108 294 120 C 288 126 278 122 270 116" {...STROKE} />
      {/* Socket (glenoid): shallow, facing the ball. */}
      <path d="M320 108 C 311 122 311 144 320 158" {...STROKE} />
      {/* Upper arm bone: the ball (highlighted) and the shaft. */}
      <circle cx={344} cy={133} r={26} {...STROKE} style={{ fill: "var(--color-brand-soft)" }} />
      <path d="M330 155 C 334 190 336 240 336 324" {...STROKE} />
      <path d="M368 143 C 370 160 366 190 362 230 C 360 260 360 290 362 324" {...STROKE} />
    </Svg>
      {SHOULDER_MARKERS.map(({ n, x, y }) => (
        <span
          key={n}
          aria-hidden
          data-marker={n}
          style={{ left: `${(x / SHOULDER_VIEW.width) * 100}%`, top: `${(y / SHOULDER_VIEW.height) * 100}%` }}
          className="absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[1.75px] border-ink bg-surface font-mono text-label font-medium text-ink"
        >
          {n}
        </span>
      ))}
    </div>
  );
}

const SCAPULA = "M0 0 L-58 -16 L-40 112 Z";
const SPINE = "M-4 -6 L-56 -2";

function ScapulaPanel({ x, rotate, arm }: { x: number; rotate: number; arm: number }) {
  // Pivot at the socket (0,0); the arm leaves the socket at `arm` degrees (0 = straight out, 90 = down).
  const rad = (arm * Math.PI) / 180;
  const [ex, ey] = [Math.cos(rad) * 84, Math.sin(rad) * 84];
  return (
    <g transform={`translate(${x} 116)`}>
      <g transform={`rotate(${rotate})`}>
        <path d={SCAPULA} {...STROKE} style={{ fill: "var(--color-brand-soft)" }} />
        <path d={SPINE} {...STROKE} />
      </g>
      <line x1={0} y1={0} x2={ex} y2={ey} {...STROKE} />
      <circle cx={0} cy={0} r={7} {...STROKE} style={{ fill: "var(--color-surface)" }} />
    </g>
  );
}

/** Scapular upward rotation at three arm positions, right shoulder blade from behind. */
export function ScapulaUpwardRotation() {
  return (
    <Svg
      viewBox="0 0 480 250"
      title="The shoulder blade rotates upward as the arm rises"
      desc="Three schematic drawings of a right shoulder blade seen from behind. With the arm by the side the shoulder blade sits upright. With the arm level with the shoulder it has rotated upward a little, and with the arm overhead it has rotated upward further, its lower tip swinging out toward the arm. Angles are illustrative."
    >
      {/* Midline of the back, for reference. */}
      <path d="M14 10 V 240" {...CONTEXT} strokeDasharray="2 6" />
      <ScapulaPanel x={100} rotate={0} arm={90} />
      <ScapulaPanel x={250} rotate={-18} arm={0} />
      <ScapulaPanel x={410} rotate={-42} arm={-76} />
    </Svg>
  );
}

import { ACCENT_FILL, CONTEXT, P, STROKE, SURFACE_FILL, type DrawingSpec } from "./primitives";

// Original schematic line art (Spindle, AI-assisted, CC BY-SA 4.0; provenance in
// docs/design/spindle/asset-provenance.json). Drawn from simple geometry, not traced from
// any atlas. Lucide-style strokes, ink lines, one accent fill on the structure the lesson is
// about. Not to scale. Geometry and named anchors only: alt text, caption and legend come
// from the lesson's diagram block (Sol R16).

const BEHIND = { ...STROKE, strokeDasharray: "4 5" } as const;

const SHOULDER_VIEW = { width: 440, height: 340 } as const;

/** Key structures, in drawing units, for the marker clearance test. */
export const SHOULDER_GEOMETRY = {
  view: SHOULDER_VIEW,
  glenoidMid: { x: 313, y: 133 },
  ball: { x: 344, y: 133, r: 26 },
  leader3: { from: { x: 402, y: 121 }, to: { x: 370, y: 128 } },
} as const;

const SHOULDER_ANCHORS = {
  sternoclavicular: P(100, 84),
  acromioclavicular: P(290, 76),
  // Clear space right of the humerus, with a leader line to the ball, so the marker never covers the socket it labels.
  glenohumeral: { x: 414, y: 118, leader: SHOULDER_GEOMETRY.leader3 },
  scapula: P(250, 250),
} as const;

function ShoulderComplexArt() {
  return (
    <g>
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
      <circle cx={344} cy={133} r={26} {...STROKE} style={ACCENT_FILL} />
      <path d="M330 155 C 334 190 336 240 336 324" {...STROKE} />
      <path d="M368 143 C 370 160 366 190 362 230 C 360 260 360 290 362 324" {...STROKE} />
    </g>
  );
}

/** Lesson 1: the shoulder complex, left shoulder from the front (the subject's left). */
export const SHOULDER_COMPLEX: DrawingSpec = { view: SHOULDER_VIEW, anchors: SHOULDER_ANCHORS, Art: ShoulderComplexArt };

const SCAPULA = "M0 0 L-58 -16 L-40 112 Z";
const SPINE = "M-4 -6 L-56 -2";
const SCAPULA_VIEW = { width: 480, height: 290 } as const;

/** Panel markers sit below each shoulder blade, clear of its lower tip. */
const SCAPULA_ANCHORS = {
  "arm-by-side": P(80, 266),
  "arm-level": P(250, 266),
  "arm-overhead": P(440, 266),
} as const;

function ScapulaPanel({ x, rotate, arm }: { x: number; rotate: number; arm: number }) {
  // Pivot at the socket (0,0); the arm leaves the socket at `arm` degrees (0 = straight out, 90 = down).
  const rad = (arm * Math.PI) / 180;
  const [ex, ey] = [Math.cos(rad) * 84, Math.sin(rad) * 84];
  return (
    <g transform={`translate(${x} 116)`}>
      <g transform={`rotate(${rotate})`}>
        <path d={SCAPULA} {...STROKE} style={ACCENT_FILL} />
        <path d={SPINE} {...STROKE} />
      </g>
      <line x1={0} y1={0} x2={ex} y2={ey} {...STROKE} />
      <circle cx={0} cy={0} r={7} {...STROKE} style={SURFACE_FILL} />
    </g>
  );
}

function ScapulaUpwardRotationArt() {
  return (
    <g>
      {/* Midline of the back, for reference. */}
      <path d="M14 10 V 240" {...CONTEXT} strokeDasharray="2 6" />
      <ScapulaPanel x={100} rotate={0} arm={90} />
      <ScapulaPanel x={250} rotate={-18} arm={0} />
      <ScapulaPanel x={410} rotate={-42} arm={-76} />
    </g>
  );
}

/** Lesson 2: a right shoulder blade from behind at three arm positions; angles illustrative. */
export const SCAPULA_UPWARD_ROTATION: DrawingSpec = { view: SCAPULA_VIEW, anchors: SCAPULA_ANCHORS, Art: ScapulaUpwardRotationArt };

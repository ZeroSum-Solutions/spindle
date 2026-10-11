import { ArrowHead, CONTEXT, GHOST, P, Person, STROKE, type DrawingSpec, type Pose } from "./primitives";
import { Dumbbell, overheadPress } from "./shoulder-practice";

// Original schematic line art for shoulder lessons 3 and 5 (Spindle, AI-assisted,
// CC BY-SA 4.0; provenance in docs/design/spindle/asset-provenance.json). Hand-written
// geometry, not traced from any image. Not to scale. Each drawing shows only positions the
// lesson already describes and adds no claim. Geometry and named anchors only: alt text,
// caption and legend come from the lesson's diagram block.

/* ------------------------------------------------------------------ */
/* Lesson 3: wall reach, lying reach, active then passive.              */
/* ------------------------------------------------------------------ */

const REACH_VIEW = { width: 480, height: 280 } as const;
const R_DROP = 34;
const R_FLOOR = 240;

/** Geometry in drawing units (after the drop), exported for the drawing tests. */
export const REACH_GEOMETRY = {
  view: REACH_VIEW,
  wallX: 50,
  wallHand: P(96, 18 + R_DROP),
  lumbar: P(62, 128 + R_DROP),
  supportElbow: P(418, 44 + R_DROP),
  supportWrist: P(432, 16 + R_DROP),
} as const;

const REACH_ANCHORS = {
  "wall-reach": P(30, 30),
  "lying-reach": P(190, 30),
  "active-passive": P(330, 30),
  "hands-stop": { x: 134, y: 52, leader: { from: P(116, 50), to: P(100, 52) } },
  "lower-back": { x: 28, y: 204, leader: { from: P(40, 192), to: P(58, 164) } },
  support: { x: 450, y: 124, leader: { from: P(440, 112), to: P(424, 84) } },
} as const;

function ReachArt() {
  // Wall reach: back to the wall, seen from the right side; the arms stop short of vertical.
  const wall: Pose = {
    head: P(64, 46),
    neck: P(60, 62),
    hip: P(60, 150),
    facing: "right",
    arms: [[P(60, 68), P(80, 42), P(96, 18)]],
    farArms: [[P(60, 68), P(78, 43), P(93, 20)]],
    legs: [[P(60, 150), P(62, 196), P(62, R_FLOOR)]],
    farLegs: [[P(60, 150), P(57, 196), P(57, R_FLOOR)]],
  };
  // Lying reach: on the back, knees bent, both arms overhead toward the floor behind.
  const lying: Pose = {
    head: P(190, 226),
    neck: P(204, 230),
    hip: P(276, 230),
    facing: "up",
    arms: [[P(208, 228), P(188, 212), P(168, 196)]],
    farArms: [[P(208, 228), P(189, 213), P(170, 198)]],
    legs: [[P(276, 230), P(298, 204), P(318, R_FLOOR)]],
  };
  // Active then passive: the client's own raise, and the further range with the arm supported.
  const client: Pose = {
    head: P(404, 46),
    neck: P(400, 62),
    hip: P(400, 150),
    facing: "right",
    arms: [[P(400, 68), P(418, 44), P(432, 16)]],
    legs: [[P(400, 150), P(402, 196), P(402, R_FLOOR)]],
    farLegs: [[P(400, 150), P(396, 196), P(396, R_FLOOR)]],
  };
  return (
    <g transform={`translate(0 ${R_DROP})`}>
      <path d={`M10 ${R_FLOOR} H470`} {...CONTEXT} />
      <path d={`M${REACH_GEOMETRY.wallX} 24 V${R_FLOOR}`} {...STROKE} data-wall />
      <path d="M60 68 L58 10" {...GHOST} data-full-range />
      <Person pose={wall} />
      <Person pose={lying} />
      <path d="M175 202 A44 44 0 0 0 164 232" {...GHOST} data-floor-behind />
      <path d="M400 68 L404 38 L406 8" {...GHOST} data-passive />
      <Person pose={client} />
      <path d="M410 50 q8 6 16 0" {...STROKE} data-support="elbow" />
      <path d="M424 22 q8 6 16 0" {...STROKE} data-support="wrist" />
    </g>
  );
}

/** Lesson 3: wall reach, lying reach, and active then passive range. */
export const REACH_SCREENS: DrawingSpec = { view: REACH_VIEW, anchors: REACH_ANCHORS, Art: ReachArt };

/* ------------------------------------------------------------------ */
/* Lesson 5: the four warm-up positions.                                */
/* ------------------------------------------------------------------ */

const WARM_VIEW = { width: 560, height: 290 } as const;
const W_DROP = 36;
const W_FLOOR = 240;

const WARM_ANCHORS = {
  position: P(34, 32),
  rotation: P(174, 32),
  "shoulder-blades": P(314, 32),
  "first-pattern": P(454, 32),
  band: { x: 298, y: 178, leader: { from: P(284, 168), to: P(254, 142) } },
} as const;

export const WARM_GEOMETRY = { view: WARM_VIEW, drop: W_DROP } as const;

function WarmArt() {
  // 1: the set-up, back supported against a wall, seen from the right side.
  const position: Pose = {
    head: P(66, 46),
    neck: P(62, 62),
    hip: P(62, 150),
    facing: "right",
    arms: [[P(62, 68), P(64, 110), P(66, 148)]],
    legs: [[P(62, 150), P(64, 196), P(64, W_FLOOR)]],
    farLegs: [[P(62, 150), P(58, 196), P(58, W_FLOOR)]],
  };
  // 2: light rotation, seen from the front: right elbow at the side, forearm turned out against a band.
  const rotation: Pose = {
    head: P(210, 40),
    neck: P(210, 58),
    hip: P(210, 150),
    shoulders: [P(186, 66), P(234, 66)],
    arms: [
      [P(186, 66), P(182, 110), P(146, 112)],
      [P(234, 66), P(239, 108), P(241, 148)],
    ],
    legs: [
      [P(210, 150), P(202, 200), P(200, W_FLOOR)],
      [P(210, 150), P(218, 200), P(220, W_FLOOR)],
    ],
  };
  // 3: shoulder blade control: arms reach forward, seen from the right side.
  const reach: Pose = {
    head: P(354, 46),
    neck: P(350, 62),
    hip: P(350, 150),
    facing: "right",
    arms: [[P(350, 68), P(374, 68), P(398, 68)]],
    farArms: [[P(350, 70), P(373, 71), P(396, 71)]],
    legs: [[P(350, 150), P(352, 196), P(352, W_FLOOR)]],
    farLegs: [[P(350, 150), P(346, 196), P(346, W_FLOOR)]],
  };
  // 4: the first pattern with a light load: a one-arm press, seen from the right side.
  const press = overheadPress(490, W_FLOOR, false);
  return (
    <g transform={`translate(0 ${W_DROP})`}>
      <path d={`M10 ${W_FLOOR} H550`} {...CONTEXT} />
      <path d={`M48 30 V${W_FLOOR}`} {...STROKE} data-wall />
      <Person pose={position} />
      {/* Band from the hand, across the body, to a post on the other side. */}
      <path d={`M262 96 V${W_FLOOR}`} {...CONTEXT} data-post />
      <path d="M146 112 L262 104" {...STROKE} strokeDasharray="1 4" data-band />
      <Person pose={rotation} />
      <path d="M180 124 Q160 130 150 122" {...CONTEXT} />
      <ArrowHead from={P(156, 128)} to={P(150, 122)} size={6} />
      <Person pose={reach} />
      <path d="M404 82 H424" {...CONTEXT} />
      <ArrowHead from={P(404, 82)} to={P(424, 82)} size={6} />
      <Person pose={press.pose} />
      <Dumbbell at={press.hand} r={5} />
    </g>
  );
}

/** Lesson 5: the four warm-up positions. */
export const SHOULDER_WARM_UP: DrawingSpec = { view: WARM_VIEW, anchors: WARM_ANCHORS, Art: WarmArt };

import { ArrowHead, ACCENT_FILL, CONTEXT, GHOST, P, Person, STROKE, SURFACE_FILL, type DrawingSpec, type Limb, type Point, type Pose } from "./primitives";

// Original schematic line art for the shoulder module's practice lessons (Spindle,
// AI-assisted, CC BY-SA 4.0; provenance in docs/design/spindle/asset-provenance.json).
// Hand-written geometry, not traced from any image. Not to scale. Each drawing shows only
// positions the lesson already describes; it adds no claim of its own. Geometry and marker
// numbers only: alt text, caption and legend come from the lesson's diagram block, whose
// legend keys pick the anchors below.

/* ------------------------------------------------------------------ */
/* Lesson 4: the three screens (right arm where one arm is used).      */
/* ------------------------------------------------------------------ */

const SCREENS_VIEW = { width: 560, height: 300 } as const;
const FLOOR = 250;
const DROP = 40; // figures sit below a strip that holds the panel markers

const SCREEN_ANCHORS = {
  "screen-1": P(34, 32),
  "screen-2": P(174, 32),
  "screen-3-over": P(314, 32),
  "screen-3-behind": P(454, 32),
} as const;

/** A standing figure seen from behind, centred on cx: the viewer's right is the subject's right. */
function standingFromBehind(cx: number, rightArm?: Limb): Pose {
  const l = P(cx - 24, 66);
  const r = P(cx + 24, 66);
  return {
    head: P(cx, 40),
    neck: P(cx, 58),
    hip: P(cx, 150),
    shoulders: [l, r],
    arms: [
      [l, P(cx - 29, 108), P(cx - 31, 148)],
      rightArm ?? [r, P(cx + 29, 108), P(cx + 31, 148)],
    ],
    legs: [
      [P(cx, 150), P(cx - 8, 200), P(cx - 10, FLOOR)],
      [P(cx, 150), P(cx + 8, 200), P(cx + 10, FLOOR)],
    ],
  };
}

/** Panel geometry, exported for the drawing tests. */
export const SCREEN_GEOMETRY = {
  view: SCREENS_VIEW,
  drop: DROP,
  panels: [70, 210, 350, 490],
  /** Screen 2: elbow at the side, bent to a right angle, forearm forward. */
  elbow: { shoulder: P(210, 66), elbow: P(210, 110), hand: P(252, 110) },
  /** Screen 3: over the shoulder (right hand to the upper back) and behind the back (right thumb up the spine). */
  overShoulder: [P(374, 66), P(372, 22), P(355, 76)] as Limb,
  behindBack: [P(514, 66), P(526, 110), P(494, 100)] as Limb,
} as const;

function ScreenArt() {
  const g = SCREEN_GEOMETRY;
  const side: Pose = {
    head: P(210, 40),
    neck: P(210, 58),
    hip: P(210, 150),
    facing: "right",
    arms: [[g.elbow.shoulder, g.elbow.elbow, g.elbow.hand]],
    farArms: [[P(210, 66), P(207, 108), P(205, 146)]],
    legs: [[P(210, 150), P(214, 200), P(212, FLOOR)]],
    farLegs: [[P(210, 150), P(206, 200), P(204, FLOOR)]],
  };
  return (
        <g transform={`translate(0 ${DROP})`}>
          <path d={`M12 ${FLOOR} H548`} {...CONTEXT} />
          {/* 1: standing relaxed, seen from behind; both shoulder blades highlighted. */}
          <path d="M62 72 L50 75 L62 108 Z" {...STROKE} style={ACCENT_FILL} />
          <path d="M78 72 L90 75 L78 108 Z" {...STROKE} style={ACCENT_FILL} />
          <Person pose={standingFromBehind(70)} />
          {/* 2: right side view; elbow at the side, bent to a right angle, thumb up. */}
          <Person pose={side} />
          <path d="M210 100 h10 v10" {...STROKE} data-right-angle />
          <path d={`M${g.elbow.hand.x} ${g.elbow.hand.y} v-10`} {...STROKE} data-thumb />
          {/* 3: right hand over the shoulder to the upper back, seen from behind. */}
          <Person pose={standingFromBehind(350, g.overShoulder)} />
          {/* 4: right hand behind the back, thumb up the spine, seen from behind. */}
          <Person pose={standingFromBehind(490, g.behindBack)} />
          <circle cx={g.overShoulder[2].x} cy={g.overShoulder[2].y} r={4} {...STROKE} style={ACCENT_FILL} />
          <circle cx={g.behindBack[2].x} cy={g.behindBack[2].y} r={4} {...STROKE} style={ACCENT_FILL} />
        </g>
  );
}

/** Lesson 4: the three shoulder screens, right arm where one arm is used. */
export const SCREEN_POSITIONS: DrawingSpec = { view: SCREENS_VIEW, anchors: SCREEN_ANCHORS, Art: ScreenArt };

/* ------------------------------------------------------------------ */
/* Lesson 6: pressing, pulling and overhead progressions.              */
/* ------------------------------------------------------------------ */

const LOAD_VIEW = { width: 480, height: 480 } as const;
const ROW_BASE = [110, 250, 466] as const;
/** Height of each row's arrows and marker, above the row's floor. */
const ROW_TOP = [80, 100, 160] as const;
const COLS = [115, 265, 415] as const;

const LOADING_ANCHORS = {
  pressing: P(28, ROW_BASE[0] - ROW_TOP[0]),
  pulling: P(28, ROW_BASE[1] - ROW_TOP[1]),
  overhead: P(28, ROW_BASE[2] - ROW_TOP[2]),
} as const;

function unit(from: Point, to: Point): Point {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  return P((to.x - from.x) / len, (to.y - from.y) / len);
}
const mid = (a: Point, b: Point) => P((a.x + b.x) / 2, (a.y + b.y) / 2);
const along = (from: Point, dir: Point, d: number) => P(from.x + dir.x * d, from.y + dir.y * d);

/** A push-up at the top, hands on a surface `h` high (0 = the floor). */
function pushUp(cx: number, base: number, h: number) {
  const hands = P(cx + 30, base - h);
  const shoulder = P(cx + 30, base - h - 26);
  const feet = P(cx - 60, base);
  const dir = unit(feet, shoulder);
  const hip = mid(feet, shoulder);
  const pose: Pose = {
    head: along(shoulder, dir, 15),
    neck: shoulder,
    hip,
    arms: [[shoulder, mid(shoulder, hands), hands]],
    legs: [[hip, mid(hip, feet), feet]],
  };
  return { pose, box: h > 0 ? { x: cx + 14, y: base - h, w: 34, h } : null };
}

export function Dumbbell({ at, r = 6 }: { at: Point; r?: number }) {
  return <circle cx={at.x} cy={at.y} r={r} {...STROKE} style={SURFACE_FILL} data-load={r} />;
}

/** A bent-over row: hinged at the hips, arm hanging to the weight. */
function bentRow(cx: number, base: number): { pose: Pose; hand: Point } {
  const hip = P(cx - 17, base - 50);
  const neck = P(cx + 25, base - 76);
  const hand = P(cx + 23, base - 22);
  return {
    hand,
    pose: {
      head: along(neck, unit(hip, neck), 15),
      neck,
      hip,
      arms: [[P(cx + 23, base - 73), P(cx + 23, base - 46), hand]],
      farArms: [[P(cx + 19, base - 71), P(cx + 18, base - 46), P(cx + 18, base - 24)]],
      legs: [[hip, P(cx - 3, base - 26), P(cx - 10, base)]],
      farLegs: [[hip, P(cx - 12, base - 26), P(cx - 20, base)]],
    },
  };
}

/** Standing or half-kneeling, facing right, one arm pressed overhead. */
export function overheadPress(cx: number, base: number, kneeling: boolean): { pose: Pose; hand: Point } {
  const hipY = kneeling ? base - 58 : base - 80;
  const hip = P(cx, hipY);
  const neck = P(cx, hipY - 50);
  // The pressing arm finishes beside the head, so it is drawn just behind the head's outline.
  const hand = P(cx - 7, hipY - 108);
  const legs: Limb[] = kneeling
    ? [[hip, P(cx + 28, hipY), P(cx + 28, base)]]
    : [[hip, P(cx + 2, hipY + 40), P(cx + 2, base)]];
  const farLegs: Limb[] = kneeling ? [[hip, P(cx - 8, base - 2), P(cx - 36, base)]] : [[hip, P(cx - 4, hipY + 40), P(cx - 6, base)]];
  return {
    hand,
    pose: { head: P(cx + 7, hipY - 64), neck, hip, facing: "right", arms: [[P(cx - 1, hipY - 46), P(cx - 7, hipY - 78), hand]], legs, farLegs },
  };
}

function Step({ y, from, to }: { y: number; from: number; to: number }) {
  return (
    <g data-step>
      <path d={`M${from} ${y} H${to}`} {...CONTEXT} />
      <ArrowHead from={P(from, y)} to={P(to, y)} />
    </g>
  );
}

export const LOADING_GEOMETRY = { view: LOAD_VIEW, rowBase: ROW_BASE, cols: COLS } as const;

function LoadingArt() {
  const [b1, b2, b3] = ROW_BASE;
  const pushes = [56, 30, 0].map((h, i) => pushUp(COLS[i]!, b1, h));
  const rowB = bentRow(COLS[1], b2);
  const rowC = bentRow(COLS[2], b2);
  const kneel = overheadPress(COLS[1], b3, true);
  const stand = overheadPress(COLS[2], b3, false);
  // Landmine: facing left toward the anchor, pressing the bar's free end up and forward.
  const lmHip = P(COLS[0] + 18, b3 - 80);
  const lmNeck = P(COLS[0] + 20, b3 - 130);
  const lmHand = P(COLS[0] - 22, b3 - 154);
  const anchor = P(COLS[0] - 80, b3);
  const bar = unit(anchor, lmHand);
  const landmine: Pose = {
    head: P(COLS[0] + 22, b3 - 146),
    neck: lmNeck,
    hip: lmHip,
    facing: "left",
    arms: [[P(COLS[0] + 20, b3 - 126), P(COLS[0] + 2, b3 - 140), lmHand]],
    legs: [[lmHip, P(COLS[0] + 8, b3 - 40), P(COLS[0] + 2, b3)]],
    farLegs: [[lmHip, P(COLS[0] + 30, b3 - 40), P(COLS[0] + 38, b3)]],
  };
  return (
      <g>
        {ROW_BASE.map((b) => (
          <path key={b} d={`M48 ${b} H470`} {...CONTEXT} />
        ))}
        {/* 1: pressing. A push-up from a raised surface, then a lower one, then the floor. */}
        {pushes.map(({ pose, box }, i) => (
          <g key={i} data-figure={`press-${i + 1}`}>
            {box ? <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={3} {...CONTEXT} /> : null}
            <Person pose={pose} />
          </g>
        ))}
        {/* 2: pulling. A chest-supported row, then an unsupported row, then a heavier load. */}
        <g data-figure="pull-1">
          <path d={`M${COLS[0] - 40} ${b2 - 14} L${COLS[0] + 25} ${b2 - 60}`} {...CONTEXT} />
          <path d={`M${COLS[0] - 35} ${b2 - 17} V${b2} M${COLS[0] + 13} ${b2 - 52} V${b2}`} {...CONTEXT} />
          <Person
            pose={{
              head: P(COLS[0] + 35, b2 - 80),
              neck: P(COLS[0] + 23, b2 - 71),
              hip: P(COLS[0] - 20, b2 - 40),
              arms: [[P(COLS[0] + 21, b2 - 68), P(COLS[0] + 21, b2 - 42), P(COLS[0] + 21, b2 - 22)]],
              legs: [[P(COLS[0] - 20, b2 - 40), P(COLS[0] - 37, b2 - 22), P(COLS[0] - 49, b2)]],
            }}
          />
          <Dumbbell at={P(COLS[0] + 21, b2 - 16)} />
        </g>
        <g data-figure="pull-2">
          <Person pose={rowB.pose} />
          <Dumbbell at={P(rowB.hand.x, rowB.hand.y + 6)} />
        </g>
        <g data-figure="pull-3">
          <Person pose={rowC.pose} />
          <Dumbbell at={P(rowC.hand.x, rowC.hand.y + 9)} r={9} />
        </g>
        {/* 3: overhead. Landmine press, then half-kneeling single-arm press, then standing press. */}
        <g data-figure="overhead-1">
          <path d={`M${anchor.x} ${anchor.y} L${lmHand.x + bar.x * 8} ${lmHand.y + bar.y * 8}`} {...STROKE} />
          <circle cx={anchor.x} cy={anchor.y - 4} r={4} {...CONTEXT} />
          <Person pose={landmine} />
        </g>
        <g data-figure="overhead-2">
          <Person pose={kneel.pose} />
          <Dumbbell at={kneel.hand} />
        </g>
        <g data-figure="overhead-3">
          <Person pose={stand.pose} />
          <Dumbbell at={stand.hand} />
        </g>
        {ROW_BASE.map((b, i) => (
          <g key={`s${b}`}>
            <Step y={b - ROW_TOP[i]!} from={COLS[0] + 60} to={COLS[1] - 62} />
            <Step y={b - ROW_TOP[i]!} from={COLS[1] + 60} to={COLS[2] - 62} />
          </g>
        ))}
      </g>
  );
}

/** Lesson 6: pressing, pulling and overhead progressions, one row each. */
export const PRESS_PULL_OVERHEAD: DrawingSpec = { view: LOAD_VIEW, anchors: LOADING_ANCHORS, Art: LoadingArt };

/* ------------------------------------------------------------------ */
/* Lesson 7: the lying rotation record position (right arm).           */
/* ------------------------------------------------------------------ */

const RECORD_VIEW = { width: 460, height: 230 } as const;
const BENCH = 150;
const ELBOW = P(124, 118);
const FOREARM = 64;


export const RECORD_GEOMETRY = {
  view: RECORD_VIEW,
  elbow: ELBOW,
  forearm: FOREARM,
  arcRadius: 78,
  towel: { x: 114, y: 124, w: 22, h: BENCH - 124 },
  head: { x: 48, y: 136, r: 11 },
  torso: { x: 62, y: 128, w: 230, h: 20 },
} as const;

const RECORD_ANCHORS = {
  towel: { x: 176, y: 196, leader: { from: P(162, 186), to: P(132, 152) } },
  "toward-head": P(30, 36),
  "toward-feet": P(218, 36),
  level: { x: 238, y: 92, leader: { from: P(226, 102), to: P(208, 116) } },
} as const;

function RecordArt() {
  const g = RECORD_GEOMETRY;
  const r = g.arcRadius;
  const top = P(ELBOW.x, ELBOW.y - r);
  const headSide = P(ELBOW.x - r, ELBOW.y);
  const feetSide = P(ELBOW.x + r, ELBOW.y);
  return (
      <g>
        {/* Bench and floor. */}
        <path d={`M30 ${BENCH} H440`} {...STROKE} />
        <path d={`M30 ${BENCH + 12} H440 M50 ${BENCH + 12} V212 M420 ${BENCH + 12} V212 M14 212 H452`} {...CONTEXT} />
        {/* Lying on the back, head to the left, seen from the right side; knees bent, feet on the bench. */}
        <path d={`M${g.torso.x + g.torso.w - 6} 140 L350 110 L392 ${BENCH}`} {...STROKE} data-legs />
        <rect x={g.torso.x} y={g.torso.y} width={g.torso.w} height={g.torso.h} rx={10} {...STROKE} style={SURFACE_FILL} data-torso />
        <circle cx={g.head.x} cy={g.head.y} r={g.head.r} {...STROKE} style={SURFACE_FILL} />
        {/* Folded towel under the elbow (highlighted), so the upper arm is level. */}
        <rect x={g.towel.x} y={g.towel.y} width={g.towel.w} height={g.towel.h} rx={3} {...STROKE} style={ACCENT_FILL} data-towel />
        <path d={`M${g.towel.x} ${g.towel.y + 12} H${g.towel.x + g.towel.w}`} {...STROKE} />
        {/* Upper arm out to the side at shoulder height, toward the viewer; elbow bent to a right angle. */}
        <path d={`M104 134 L${ELBOW.x} ${ELBOW.y}`} {...STROKE} />
        {/* Level with the floor, toward the head and toward the feet. */}
        <path d={`M${headSide.x} ${ELBOW.y} H${feetSide.x}`} {...GHOST} data-level />
        {/* Forearm pointing up, with the two directions it turns. */}
        <path d={`M${ELBOW.x} ${ELBOW.y} V${ELBOW.y - FOREARM}`} {...STROKE} />
        <path d={`M${top.x} ${top.y} A${r} ${r} 0 0 0 ${headSide.x} ${headSide.y - 2}`} {...CONTEXT} data-arc="head" />
        <ArrowHead from={P(headSide.x + 0.5, headSide.y - 14)} to={P(headSide.x, headSide.y - 2)} />
        <path d={`M${top.x} ${top.y} A${r} ${r} 0 0 1 ${feetSide.x} ${feetSide.y - 2}`} {...CONTEXT} data-arc="feet" />
        <ArrowHead from={P(feetSide.x - 0.5, feetSide.y - 14)} to={P(feetSide.x, feetSide.y - 2)} />
        <circle cx={ELBOW.x} cy={ELBOW.y} r={6} {...STROKE} style={SURFACE_FILL} />
      </g>
  );
}

/** Lesson 7: the lying rotation record position, right arm, seen from the athlete's right side. */
export const ROTATION_RECORD_POSITION: DrawingSpec = { view: RECORD_VIEW, anchors: RECORD_ANCHORS, Art: RecordArt };

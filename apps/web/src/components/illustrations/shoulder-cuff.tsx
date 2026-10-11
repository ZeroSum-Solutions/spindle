import { ACCENT_FILL, CONTEXT, P, STROKE, SURFACE_FILL, type DrawingSpec } from "./primitives";

// Original schematic line art (Spindle, AI-assisted, CC BY-SA 4.0; provenance in
// docs/design/spindle/asset-provenance.json). The rotator cuff of a left shoulder, front and
// back. Hand-written geometry, not traced from any atlas or image; not to scale. It draws
// only what the lesson's cuff claim states: four muscles that start on the shoulder blade
// and attach to the top of the humerus, around the ball and socket. Geometry and named
// anchors only: every word comes from the lesson's diagram block.

const CUFF_VIEW = { width: 480, height: 270 } as const;

/** Key points in drawing units, exported for the drawing tests. */
export const CUFF_GEOMETRY = {
  view: CUFF_VIEW,
  /** Front view, left shoulder: the subject's left is on the viewer's right. */
  front: { head: { x: 176, y: 92, r: 22 }, glenoid: P(150, 94) },
  /** Back view, left shoulder: the subject's left is on the viewer's left. */
  back: { head: { x: 304, y: 92, r: 22 }, glenoid: P(330, 94) },
} as const;

const CUFF_ANCHORS = {
  "front-view": P(30, 30),
  "back-view": P(452, 30),
  subscapularis: { x: 70, y: 236, leader: { from: P(86, 226), to: P(112, 150) } },
  supraspinatus: { x: 392, y: 30, leader: { from: P(380, 42), to: P(372, 68) } },
  infraspinatus: { x: 452, y: 150, leader: { from: P(436, 146), to: P(400, 132) } },
  "teres-minor": { x: 412, y: 238, leader: { from: P(398, 230), to: P(352, 178) } },
  "humeral-head": { x: 240, y: 30, leader: { from: P(226, 38), to: P(192, 76) } },
} as const;

function CuffArt() {
  const f = CUFF_GEOMETRY.front.head;
  const b = CUFF_GEOMETRY.back.head;
  return (
    <g>
      {/* Divider between the two views. */}
      <path d="M240 60 V250" {...CONTEXT} strokeDasharray="2 6" />

      {/* FRONT, left shoulder. Shoulder blade seen from the front, behind the ribs (medial border to the left). */}
      <path d="M70 66 L150 82 L156 104 L96 214 Z" {...CONTEXT} data-scapula="front" />
      {/* Humerus: head and shaft, drawn first so the tendon lies over the head. */}
      <circle cx={f.x} cy={f.y} r={f.r} {...STROKE} style={SURFACE_FILL} />
      <path d={`M${f.x - 12} ${f.y + 18} C ${f.x - 10} 150 ${f.x - 8} 200 ${f.x - 8} 252`} {...STROKE} />
      <path d={`M${f.x + 16} ${f.y + 16} C ${f.x + 14} 150 ${f.x + 12} 200 ${f.x + 12} 252`} {...STROKE} />
      {/* Subscapularis: fills the front of the shoulder blade and crosses in front of the joint to the humerus. */}
      <path d="M78 74 L146 88 L170 100 L172 110 L150 112 L98 202 Z" {...STROKE} style={ACCENT_FILL} data-muscle="subscapularis" />
      {/* Acromion and collarbone above the joint. */}
      <path d="M40 58 C 90 46 130 60 160 56 C 182 52 200 58 206 70" {...STROKE} />
      {/* The subscapularis tendon passes over the front of the head. */}
      <path d="M150 104 L172 104" {...STROKE} />

      {/* BACK, left shoulder. Shoulder blade seen from behind (medial border to the right). */}
      <path d="M418 66 L330 84 L326 104 L390 214 Z" {...STROKE} style={SURFACE_FILL} data-scapula="back" />
      {/* Humerus: head (lateral, to the viewer's left) and shaft, drawn first so the tendons lie over the head. */}
      <circle cx={b.x} cy={b.y} r={b.r} {...STROKE} style={SURFACE_FILL} />
      <path d={`M${b.x + 12} ${b.y + 18} C ${b.x + 10} 150 ${b.x + 8} 200 ${b.x + 8} 252`} {...STROKE} />
      <path d={`M${b.x - 16} ${b.y + 16} C ${b.x - 14} 150 ${b.x - 12} 200 ${b.x - 12} 252`} {...STROKE} />
      {/* Supraspinatus: above the spine of the shoulder blade, under the acromion, to the top of the head. */}
      <path d="M414 70 L418 92 L344 88 L300 70 L312 64 L346 70 Z" {...STROKE} style={ACCENT_FILL} data-muscle="supraspinatus" />
      {/* Infraspinatus: below the spine, to the back of the head. */}
      <path d="M418 98 L404 168 L366 156 L330 106 L284 92 L288 82 L344 96 Z" {...STROKE} style={ACCENT_FILL} data-muscle="infraspinatus" />
      {/* Teres minor: along the outer border, below infraspinatus, to the back of the head. */}
      <path d="M364 162 L388 188 L380 196 L330 122 L288 106 L290 98 L332 112 Z" {...STROKE} style={ACCENT_FILL} data-muscle="teres-minor" />
      {/* Spine of the shoulder blade, ending in the acromion over the head. */}
      <path d="M420 94 L344 92 C 320 80 300 66 280 70" {...STROKE} data-spine />
    </g>
  );
}

/** Lesson 1: the rotator cuff of a left shoulder, front and back. */
export const SHOULDER_CUFF: DrawingSpec = { view: CUFF_VIEW, anchors: CUFF_ANCHORS, Art: CuffArt };

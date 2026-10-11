import type { ReactNode } from "react";
import { ImageOff } from "lucide-react";
import { Drawing, type DrawingSpec, type LegendItem } from "../illustrations/primitives";
import { SHOULDER_CUFF } from "../illustrations/shoulder-cuff";
import { REACH_SCREENS, SHOULDER_WARM_UP } from "../illustrations/shoulder-movement";
import { PRESS_PULL_OVERHEAD, ROTATION_RECORD_POSITION, SCREEN_POSITIONS } from "../illustrations/shoulder-practice";
import { ScapulaUpwardRotation, ShoulderComplex } from "../illustrations/shoulder";

// Original diagrams a lesson can place by id (a `diagram` block's diagramId). Each is an
// inline SVG with its own title and description, plus a text legend so nothing is
// carried by the drawing alone. Unknown ids render the "not available yet" state.

export interface DiagramEntry {
  drawing: () => ReactNode;
  /** Numbered keys for markers in the drawing, or panel labels in order. */
  legend: { kind: "numbered" | "panels"; items: string[] };
}

export const DIAGRAMS: Readonly<Record<string, DiagramEntry>> = {
  "shoulder-complex-front": {
    drawing: () => <ShoulderComplex />,
    legend: {
      kind: "numbered",
      items: [
        "Sternoclavicular joint: the collarbone meets the breastbone.",
        "Acromioclavicular joint: the collarbone meets the top of the shoulder blade.",
        "Glenohumeral joint: the ball and socket (highlighted).",
        "The shoulder blade, which lies behind the ribs (dashed).",
      ],
    },
  },
  "scapula-upward-rotation": {
    drawing: () => <ScapulaUpwardRotation />,
    legend: { kind: "panels", items: ["Arm by the side", "Arm level with the shoulder", "Arm overhead"] },
  },
};

/**
 * The drawing for a diagram id, or undefined. Only the registry's own keys count: an id
 * like "toString" or "constructor" passes the content schema but must not resolve to an
 * inherited property.
 */
export function diagramFor(id: string): DiagramEntry | undefined {
  return Object.hasOwn(DIAGRAMS, id) ? DIAGRAMS[id] : undefined;
}

export function DiagramFigure({ entry }: { entry: DiagramEntry }) {
  return (
    <div className="flex flex-col gap-3 rounded-card bg-surface-muted p-4 md:p-6">
      <div className="mx-auto w-full max-w-[34rem]">{entry.drawing()}</div>
      {entry.legend.kind === "numbered" ? (
        <ol className="flex flex-col gap-1 text-label text-text">
          {entry.legend.items.map((item, i) => (
            <li key={i} className="flex gap-2">
              <span className="font-mono text-code text-text-muted">{i + 1}</span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      ) : (
        <ol className="grid grid-cols-3 gap-2 text-center text-label text-text-muted">
          {entry.legend.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ol>
      )}
      <p className="text-label text-text-muted">Schematic, not to scale.</p>
    </div>
  );
}

/* ------------------------------------------------------------------------------------- */
/* Reviewed diagrams (Sol R16): geometry here, every word from the lesson's diagram block. */
/* ------------------------------------------------------------------------------------- */

/** The reviewed diagram block content (mirrors DiagramContent in @spindle/schema). */
export interface ReviewedDiagramContent {
  diagramId: string;
  alt: string;
  caption: string;
  legend: LegendItem[];
}

/** Drawings by diagram id. Geometry and anchor names only; no text a learner reads. */
export const DRAWINGS: Readonly<Record<string, DrawingSpec>> = {
  "shoulder-cuff-and-movers": SHOULDER_CUFF,
  "reach-screens": REACH_SCREENS,
  "shoulder-warm-up": SHOULDER_WARM_UP,
  "screen-start-positions": SCREEN_POSITIONS,
  "press-pull-overhead": PRESS_PULL_OVERHEAD,
  "rotation-record-position": ROTATION_RECORD_POSITION,
};

/** The drawing for a diagram id, or undefined; only the registry's own keys count. */
export function drawingFor(id: string): DrawingSpec | undefined {
  return Object.hasOwn(DRAWINGS, id) ? DRAWINGS[id] : undefined;
}

/**
 * A reviewed diagram: the drawing for its id with the block's alt text and numbered legend,
 * and the block's caption. An id with no drawing shows the unavailable state, still with the
 * block's caption and legend, so the lesson text is never lost.
 */
export function ReviewedDiagram({ content }: { content: ReviewedDiagramContent }) {
  const spec = drawingFor(content.diagramId);
  return (
    <figure data-block="diagram" data-diagram={spec ? "available" : undefined} className="flex flex-col gap-2">
      <div className="flex flex-col gap-3 rounded-card bg-surface-muted p-4 md:p-6">
        {spec ? (
          <div className="mx-auto w-full max-w-[34rem]">
            <Drawing spec={spec} alt={content.alt} legend={content.legend} />
          </div>
        ) : (
          <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-card border border-dashed border-control p-6 text-center text-text-muted">
            <ImageOff aria-hidden strokeWidth={1.75} className="size-6" />
            <p className="text-label">This diagram is not available yet.</p>
          </div>
        )}
        {content.legend.length > 0 ? (
          <ol className="flex flex-col gap-2 text-label text-text">
            {content.legend.map((item, i) => (
              <li key={item.key} data-legend={item.key} className="flex gap-2">
                <span className="font-mono text-code text-text-muted">{i + 1}</span>
                <span>
                  <span className="font-medium">{item.label}</span>
                  {item.text ? <span className="text-text-muted">{` ${item.text}`}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
      {content.caption ? <figcaption className="text-label text-text-muted">{content.caption}</figcaption> : null}
    </figure>
  );
}

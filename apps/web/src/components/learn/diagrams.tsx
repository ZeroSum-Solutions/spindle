import { ImageOff } from "lucide-react";
import type { DiagramContent } from "@spindle/schema";
import { Drawing, type DrawingSpec } from "../illustrations/primitives";
import { SCAPULA_UPWARD_ROTATION, SHOULDER_COMPLEX } from "../illustrations/shoulder";
import { SHOULDER_CUFF } from "../illustrations/shoulder-cuff";
import { REACH_SCREENS, SHOULDER_WARM_UP } from "../illustrations/shoulder-movement";
import { PRESS_PULL_OVERHEAD, ROTATION_RECORD_POSITION, SCREEN_POSITIONS } from "../illustrations/shoulder-practice";

// Original diagrams a lesson places by id (a diagram block's diagramId). Code holds geometry
// and named anchors only; every word a learner reads (alt text, caption, legend) comes from
// the lesson's diagram block, so it is hashed and reviewed with the lesson (Sol R16).

/* ------------------------------------------------------------------------------------- */
/* Reviewed diagrams (Sol R16): geometry here, every word from the lesson's diagram block. */
/* ------------------------------------------------------------------------------------- */

export type ReviewedDiagramContent = DiagramContent;

/** Drawings by diagram id. Geometry and anchor names only; no text a learner reads. */
export const DRAWINGS: Readonly<Record<string, DrawingSpec>> = {
  "shoulder-complex-front": SHOULDER_COMPLEX,
  "scapula-upward-rotation": SCAPULA_UPWARD_ROTATION,
  "shoulder-cuff": SHOULDER_CUFF,
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

/**
 * A diagram block from before R16 ({diagramId, caption}), still readable in old snapshots. It
 * shows the drawing without markers, because the block carries no legend, and its own caption.
 */
export function LegacyDiagram({ content }: { content: { diagramId: string; caption: string } }) {
  const spec = drawingFor(content.diagramId);
  return (
    <figure data-block="diagram" data-diagram={spec ? "available" : undefined} className="flex flex-col gap-2">
      {spec ? (
        <div className="rounded-card bg-surface-muted p-4 md:p-6">
          <div className="mx-auto w-full max-w-[34rem]">
            <Drawing spec={spec} alt={content.caption || "Diagram"} legend={[]} />
          </div>
        </div>
      ) : (
        <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-card border border-dashed border-control bg-surface-muted p-6 text-center text-text-muted">
          <ImageOff aria-hidden strokeWidth={1.75} className="size-6" />
          <p className="text-label">This diagram is not available yet.</p>
        </div>
      )}
      {content.caption ? <figcaption className="text-label text-text-muted">{content.caption}</figcaption> : null}
    </figure>
  );
}

import type { ReactNode } from "react";
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

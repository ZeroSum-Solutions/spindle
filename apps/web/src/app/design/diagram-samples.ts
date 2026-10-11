import type { ReviewedDiagramContent } from "@/components/learn/diagrams";

// Sample diagram block content for the design specimen only. In a lesson, every one of these
// words lives in the lesson's diagram block and is reviewed with it; the drawings supply
// geometry and anchors only.

export const DIAGRAM_SAMPLES: readonly ReviewedDiagramContent[] = [
  {
    diagramId: "screen-start-positions",
    alt: "Four schematic figures: standing seen from behind, standing seen from the right side with the elbow bent, and two figures seen from behind reaching with the right hand over the shoulder and behind the back.",
    caption: "Sample text. The three screens; where one arm is used, the right arm is shown. Schematic, not to scale.",
    legend: [
      { key: "screen-1", label: "Screen 1, arm raise.", text: "Stand behind the client: arms by the sides, shoulder blades visible (highlighted)." },
      { key: "screen-2", label: "Screen 2, rotation range.", text: "Elbow at the side, bent to a right angle, thumb up." },
      { key: "screen-3-over", label: "Screen 3, over the shoulder.", text: "Reach over the shoulder to the upper back; note where the fingertips reach." },
      { key: "screen-3-behind", label: "Screen 3, behind the back.", text: "Reach behind the back and up the spine; note where the thumb reaches. One side at a time." },
    ],
  },
  {
    diagramId: "press-pull-overhead",
    alt: "Three rows of schematic figures, each a progression left to right: push-ups from a high box to the floor; a chest-supported row, a bent-over row and a heavier bent-over row; a landmine press, a half-kneeling one-arm press and a standing press.",
    caption: "Sample text. One progression per row, left to right; change one thing at a time. Schematic, not to scale.",
    legend: [
      { key: "pressing", label: "Pressing.", text: "Push-up from a raised surface, then a lower surface, then the floor." },
      { key: "pulling", label: "Pulling.", text: "Chest-supported row, then an unsupported row, then a heavier load." },
      { key: "overhead", label: "Overhead.", text: "Landmine press, then half-kneeling single-arm press, then standing press." },
    ],
  },
  {
    diagramId: "rotation-record-position",
    alt: "A schematic figure lying on its back on a bench, seen from the right side. The right upper arm points toward the viewer with a folded towel under the elbow; the forearm points up, with arcs showing it turning toward the head and toward the feet.",
    caption: "Sample text. The lying rotation record position, right arm. Schematic, not to scale.",
    legend: [
      { key: "towel", label: "Towel under the elbow.", text: "The upper arm is out to the side at shoulder height and level." },
      { key: "toward-head", label: "Toward the head.", text: "The athlete turns the forearm up toward the head, on their own." },
      { key: "toward-feet", label: "Toward the feet.", text: "Then down toward the feet. You do not push." },
      { key: "level", label: "Level with the floor.", text: "Record where the forearm stops: short of level, level or past level." },
    ],
  },
];

import { MODALITY_LABELS, type ModalityTag } from "./view";

/**
 * A modality tag. On the band (catalog hero) it is on-band text on the band tint; on a card it is
 * text on surface-muted. Never interactive. The youth tag reads "Youth coaching education".
 */
export function ModalityChip({ tag, on }: { tag: ModalityTag; on: "band" | "surface" }) {
  const tone = on === "band" ? "bg-band-tint text-on-band" : "bg-surface-muted text-text";
  return <span className={`inline-flex items-center rounded-small px-2.5 py-1 text-label font-medium leading-none ${tone}`}>{MODALITY_LABELS[tag]}</span>;
}

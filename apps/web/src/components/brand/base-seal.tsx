import { BASE_ATTRIBUTION } from "@spindle/engine";

/**
 * The fixed base curriculum seal: the Spindle symbol (an ink tile) and "Base curriculum by Spindle,
 * cited". Only where cited base curriculum appears; never on the band, a method or a modality course.
 * No check-shield and no review claim (D-08). `strip` adds the hairline rules of a section header.
 */
export function BaseSeal({ strip = false }: { strip?: boolean }) {
  return (
    <span data-base-seal className={`inline-flex items-center gap-2 text-label text-text-muted ${strip ? "w-full border-y border-border py-2.5" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand SVG, decorative beside the text */}
      <img src="/brand/spindle-symbol.svg" alt="" width={16} height={16} className="size-4 shrink-0 rounded-[3px]" />
      {BASE_ATTRIBUTION}
    </span>
  );
}

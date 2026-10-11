import { SYMBOL_PATH, SYMBOL_VIEWBOX, WORDMARK_ASPECT, WORDMARK_PATH, WORDMARK_VIEWBOX } from "./wordmark-path";

/**
 * Spindle's Lab wordmark as inline SVG in `currentColor`, so it takes the theme's ink (or any text
 * colour) with no second file. `label` names it for assistive technology; pass "" when a parent link
 * already carries the name.
 */
export function SpindleWordmark({ height, label = "Spindle", className = "" }: { height: number; label?: string; className?: string }) {
  const width = Math.round(height * WORDMARK_ASPECT);
  return (
    <svg viewBox={WORDMARK_VIEWBOX} width={width} height={height} role={label ? "img" : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : true} focusable="false" className={className}>
      <path fill="currentColor" d={WORDMARK_PATH} />
    </svg>
  );
}

/** The cut-d symbol alone, in `currentColor` (for a tile, draw the tile behind it). */
export function SpindleSymbol({ size, label = "Spindle", className = "" }: { size: number; label?: string; className?: string }) {
  return (
    <svg viewBox={SYMBOL_VIEWBOX} width={size} height={size} role={label ? "img" : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : true} focusable="false" className={className}>
      <path fill="currentColor" d={SYMBOL_PATH} />
    </svg>
  );
}

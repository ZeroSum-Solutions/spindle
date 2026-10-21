/**
 * The brand a public surface renders. Spindle's own brand is the default; a gym or
 * coach-creator brand can replace it later without touching page structure. The
 * wordmark files must keep their own clear space and minimum height (DESIGN.md › Brand).
 */
export interface Brand {
  name: string;
  /** A wordmark for light surfaces and one for dark surfaces; the theme decides which shows. */
  wordmark: { onLight: string; onDark: string; width: number; height: number };
}

export const SPINDLE: Brand = {
  name: "Spindle",
  wordmark: {
    onLight: "/brand/spindle-wordmark-graphite.svg",
    onDark: "/brand/spindle-wordmark-light.svg",
    // 4.37:1 (Archivo at its widest); 27px tall, above the 24px minimum where the cuts stay open.
    width: 118,
    height: 27,
  },
};

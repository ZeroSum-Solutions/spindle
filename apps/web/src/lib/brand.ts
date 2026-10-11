/**
 * The brand a public surface renders. Spindle's own brand is the default; a gym or
 * coach-creator brand can replace it later without touching page structure. The
 * wordmark files must keep their own clear space and minimum width (DESIGN.md › Brand).
 */
export interface Brand {
  name: string;
  /** Ink wordmark for light surfaces and a reverse one for ink surfaces. */
  wordmark: { onLight: string; onInk: string; width: number; height: number };
}

export const SPINDLE: Brand = {
  name: "Spindle",
  wordmark: {
    onLight: "/brand/spindle-wordmark-ink.svg",
    onInk: "/brand/spindle-wordmark-white.svg",
    width: 120,
    height: 33,
  },
};

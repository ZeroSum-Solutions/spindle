// WCAG 2.2 contrast maths on literal sRGB hex colours. Pure, so it is unit-tested.

const HEX = /^#[0-9a-fA-F]{6}$/;

export function isHex(value: string): boolean {
  return HEX.test(value);
}

function channels(hex: string): [number, number, number] {
  if (!isHex(hex)) throw new Error(`not a #RRGGBB colour: ${hex}`);
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

/** Relative luminance, WCAG 2.2 definition (sRGB threshold 0.04045). */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map(linear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two colours, 1 to 21. Never rounded: pass and fail use this exact value. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** `a` mixed toward `b` by `t` (0 = a, 1 = b), in sRGB, rounded to a lower-case hex colour. */
export function mix(a: string, b: string, t: number): string {
  const [ca, cb] = [channels(a), channels(b)];
  return `#${ca.map((c, i) => Math.round(c + (cb[i]! - c) * t).toString(16).padStart(2, "0")).join("")}`;
}

/** One sRGB channel (0 to 255) to linear light. */
function linear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** OKLab coordinates (Ottosson 2020) of an sRGB hex colour. */
export function oklab(hex: string): [number, number, number] {
  const [r, g, b] = channels(hex).map(linear) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Euclidean distance between two colours in OKLab: 0 for the same colour, about 0.02 at the edge of notice. */
export function oklabDistance(a: string, b: string): number {
  const [pa, pb] = [oklab(a), oklab(b)];
  return Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
}

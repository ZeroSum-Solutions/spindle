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
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
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

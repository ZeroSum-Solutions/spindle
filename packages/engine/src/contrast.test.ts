import { describe, expect, it } from "vitest";
import { contrast, isHex, luminance, mix, oklab, oklabDistance } from "./contrast";

// A small deterministic generator, so the property tests are repeatable.
function* colours(seed: number, n: number): Generator<string> {
  let x = seed;
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) % 2 ** 31;
    yield `#${(x % 0x1000000).toString(16).padStart(6, "0")}`;
  }
}

describe("WCAG 2.2 contrast", () => {
  it("matches the specification's reference points", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 10);
    expect(contrast("#FFFFFF", "#FFFFFF")).toBe(1);
    expect(luminance("#FFFFFF")).toBeCloseTo(1, 12);
    expect(luminance("#000000")).toBe(0);
    // #767676 is the lightest grey that meets 4.5:1 on white; #777777 just fails.
    expect(contrast("#767676", "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#777777", "#FFFFFF")).toBeLessThan(4.5);
    // The sRGB linearisation threshold is 0.04045 (WCAG 2.2 corrigendum), not 0.03928.
    expect(luminance("#0A0A0A")).toBeCloseTo(10 / 255 / 12.92 * 1, 12);
  });

  it("weights the channels exactly as WCAG does (0.2126 R, 0.7152 G, 0.0722 B)", () => {
    expect(luminance("#FF0000")).toBeCloseTo(0.2126, 12);
    expect(luminance("#00FF00")).toBeCloseTo(0.7152, 12);
    expect(luminance("#0000FF")).toBeCloseTo(0.0722, 12);
    // A mixed pair: pure blue on white is 1.05 / 0.1222.
    expect(contrast("#0000FF", "#FFFFFF")).toBeCloseTo(1.05 / 0.1222, 10);
    expect(contrast("#0000FF", "#FFFFFF")).toBeCloseTo(8.59247, 5);
  });

  it("is symmetric, bounded to 1..21, and equal to 1 only for equal luminance (property)", () => {
    const list = [...colours(7, 400)];
    for (let i = 0; i < list.length - 1; i++) {
      const [a, b] = [list[i]!, list[i + 1]!];
      const r = contrast(a, b);
      expect(r).toBeCloseTo(contrast(b, a), 12);
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(21);
      expect(contrast(a, a)).toBe(1);
    }
  });

  it("grows as one colour moves away from the other's luminance (property)", () => {
    for (const c of colours(11, 100)) {
      const towardWhite = [0, 0.25, 0.5, 0.75, 1].map((t) => contrast("#000000", mix(c, "#FFFFFF", t)));
      for (let i = 1; i < towardWhite.length; i++) expect(towardWhite[i]!).toBeGreaterThanOrEqual(towardWhite[i - 1]!);
    }
  });

  it("mixes in sRGB toward the second colour and accepts only #RRGGBB", () => {
    expect(mix("#000000", "#FFFFFF", 0.5)).toBe("#808080");
    expect(mix("#7A1F2B", "#FFFFFF", 0)).toBe("#7a1f2b");
    expect(mix("#7A1F2B", "#FFFFFF", 1)).toBe("#ffffff");
    for (const bad of ["red", "#FFF", "#GGGGGG", "#FFFFFF ", "var(--x)", "rgb(0,0,0)"]) {
      expect(isHex(bad)).toBe(false);
      expect(() => contrast(bad, "#FFFFFF")).toThrow();
    }
  });
});

describe("OKLab distance", () => {
  it("matches Ottosson's reference points", () => {
    const [l, a, b] = oklab("#FFFFFF");
    expect(l).toBeCloseTo(1, 6);
    expect(a).toBeCloseTo(0, 6);
    expect(b).toBeCloseTo(0, 6);
    const red = oklab("#FF0000");
    expect(red[0]).toBeCloseTo(0.627955, 5);
    expect(red[1]).toBeCloseTo(0.224863, 5);
    expect(red[2]).toBeCloseTo(0.125846, 5);
    expect(oklab("#000000")).toEqual([0, 0, 0]);
  });

  it("is zero for the same colour, symmetric and non-negative (property)", () => {
    const list = [...colours(23, 200)];
    for (let i = 0; i < list.length - 1; i++) {
      const [x, y] = [list[i]!, list[i + 1]!];
      expect(oklabDistance(x, x)).toBe(0);
      expect(oklabDistance(x, y)).toBeCloseTo(oklabDistance(y, x), 12);
      expect(oklabDistance(x, y)).toBeGreaterThanOrEqual(0);
    }
    expect(oklabDistance("#000000", "#FFFFFF")).toBeCloseTo(1, 6);
  });
});

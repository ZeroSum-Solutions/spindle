import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PALETTE, contrast, mix } from "@spindle/engine";

// The validator checks brands against PALETTE; the page draws with globals.css. They must agree, in both themes.
const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
/** [light, dark] of a `--color-<name>: light-dark(#light, #dark)` token. */
const token = (name: string) => {
  const m = css.match(new RegExp(`--color-${name}:\\s*light-dark\\((#[0-9a-fA-F]{6}),\\s*(#[0-9a-fA-F]{6})\\)`));
  return m ? [m[1]!.toLowerCase(), m[2]!.toLowerCase()] : undefined;
};
const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

describe("PALETTE matches the @theme tokens in both themes", () => {
  it.each(Object.keys(PALETTE.light))("%s", (key) => {
    const k = key as keyof typeof PALETTE.light;
    expect(token(kebab(key)), key).toEqual([PALETTE.light[k], PALETTE.dark[k]]);
  });

  it("defines the tenant band tokens with their P4-A2 derivation from the default band (each theme's canvas)", () => {
    // DESIGN.md › Colors: on-band is light or graphite ink, whichever is higher on the band; band-tint and
    // band-edge mix on-band 12% and 20% into the band. The defaults must follow the same rule in each theme.
    const [band, onBand, tint, edge] = ["band", "on-band", "band-tint", "band-edge"].map(token);
    (["light", "dark"] as const).forEach((theme, i) => {
      expect(band![i]).toBe(PALETTE[theme].canvas);
      const expected = contrast(PALETTE.dark.text, band![i]!) >= contrast(PALETTE.light.text, band![i]!) ? PALETTE.dark.text : PALETTE.light.text;
      expect(onBand![i]).toBe(expected);
      expect(contrast(expected, band![i]!)).toBeGreaterThanOrEqual(4.5);
      expect(tint![i]).toBe(mix(band![i]!, expected, 0.12));
      expect(edge![i]).toBe(mix(band![i]!, expected, 0.2));
    });
  });

  it("defines Spindle's default accent as the signal, with the engine's hover and soft derivation", () => {
    expect(token("brand")).toEqual([PALETTE.light.signal, PALETTE.dark.signal]);
    expect(token("on-brand")).toEqual([PALETTE.light.onSignal, PALETTE.dark.onSignal]);
    expect(token("brand-hover")).toEqual([mix(PALETTE.light.signal, "#000000", 0.15), mix(PALETTE.dark.signal, "#ffffff", 0.15)]);
    expect(token("brand-soft")).toEqual([mix(PALETTE.light.signal, PALETTE.light.surface, 0.9), mix(PALETTE.dark.signal, PALETTE.dark.surface, 0.9)]);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ATLAS, contrast, mix } from "@spindle/engine";

// The validator checks brands against ATLAS; the page draws with globals.css. They must agree.
const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
const token = (name: string) => css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1]?.toLowerCase();

describe("ATLAS matches the @theme tokens", () => {
  it.each(Object.entries(ATLAS))("%s", (key, value) => {
    const name = key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    expect(token(name), key).toBe(value);
  });

  it("defines the on-brand token the brand maps onto", () => {
    expect(token("on-brand")).toBe("#ffffff");
  });

  it("defines the tenant band tokens with their P4-A2 derivation from the default band (surface)", () => {
    // DESIGN.md › Colors: on-band is ink or white, whichever is higher on the band; band-tint and
    // band-edge mix on-band 12% and 20% into the band. The defaults must follow the same rule.
    const band = token("band");
    expect(band).toBe(ATLAS.surface);
    const onBand = contrast(ATLAS.ink, band!) >= contrast("#ffffff", band!) ? ATLAS.ink : "#ffffff";
    expect(token("on-band")).toBe(onBand);
    expect(contrast(onBand, band!)).toBeGreaterThanOrEqual(4.5);
    expect(token("band-tint")).toBe(mix(band!, onBand, 0.12));
    expect(token("band-edge")).toBe(mix(band!, onBand, 0.2));
  });
});

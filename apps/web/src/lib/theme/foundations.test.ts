import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrast } from "@spindle/engine";
import { CHECKED_PAIRS, MOTION, PALETTE, RADII, SPACING } from "./foundations";

// The /design kit shows these values; they must be the values the app draws with.
const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
const values = (name: string) => [...css.matchAll(new RegExp(`--${name}:\\s*([^;]+);`, "g"))].map((m) => m[1]!.trim().toLowerCase());

describe("the /design foundations mirror globals.css", () => {
  it.each(PALETTE)("colour $token", ({ token, hex }) => expect(values(`color-${token}`)).toContain(hex));
  it.each(SPACING)("spacing %s", (name, phone, desktop) => {
    expect(values(`spacing-${name}`)).toContain(`${phone}px`);
    expect(values(`spacing-${name}`)).toContain(`${desktop}px`);
  });
  it.each(RADII)("radius %s", (name, v) => expect(values(`radius-${name}`)).toContain(v));
  it.each(MOTION)("duration $token", ({ token, ms }) => expect(values(`duration-${token}`)).toContain(`${ms}ms`));
  it.each(CHECKED_PAIRS)("%s on %s meets its minimum", (_f, fg, _b, bg, min) => expect(contrast(fg, bg)).toBeGreaterThanOrEqual(min));
});

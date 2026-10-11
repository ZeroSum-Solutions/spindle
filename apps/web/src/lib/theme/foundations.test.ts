import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrast } from "@spindle/engine";
import { CHECKED_PAIRS, MOTION, PALETTE, RADII, SPACING, tokenValue } from "./foundations";

// The /design kit shows these values; they must be the values the app draws with, in both themes.
const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
const values = (name: string) => [...css.matchAll(new RegExp(`--${name}:\\s*([^;]+);`, "g"))].map((m) => m[1]!.trim().toLowerCase());

describe("the /design foundations mirror globals.css", () => {
  it.each(PALETTE)("colour $token", ({ token, light, dark }) => expect(values(`color-${token}`)).toContain(`light-dark(${light}, ${dark})`));
  it.each(["on-ink", "on-signal", "on-stop-panel", "science-soft", "practice-soft", "danger-soft"] as const)("colour %s", (token) =>
    expect(values(`color-${token}`)).toContain(`light-dark(${tokenValue(token, "light")}, ${tokenValue(token, "dark")})`),
  );
  it.each(SPACING)("spacing %s", (name, phone, desktop) => {
    expect(values(`spacing-${name}`)).toContain(`${phone}px`);
    expect(values(`spacing-${name}`)).toContain(`${desktop}px`);
  });
  it.each(RADII)("radius %s", (name, v) => expect(values(`radius-${name}`)).toContain(v));
  it.each(MOTION)("duration $token", ({ token, ms }) => expect(values(`duration-${token}`)).toContain(`${ms}ms`));
  for (const theme of ["light", "dark"] as const) {
    it.each(CHECKED_PAIRS)(`${theme}: %s on %s meets its minimum`, (fg, bg, min) => expect(contrast(tokenValue(fg, theme), tokenValue(bg, theme))).toBeGreaterThanOrEqual(min));
  }
});

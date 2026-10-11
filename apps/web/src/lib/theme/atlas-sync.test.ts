import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ATLAS } from "@spindle/engine";

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
});

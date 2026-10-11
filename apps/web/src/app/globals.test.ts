import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

/** The body of the global :focus-visible rule. */
function focusRule(): string {
  const match = css.match(/:where\(a, button, input, select, textarea, summary, \[tabindex\]\):focus-visible\s*\{([^}]*)\}/);
  if (!match) throw new Error("global focus rule not found");
  return match[1]!;
}

describe("global focus ring", () => {
  it("uses the ring colour property, with cobalt as the default", () => {
    expect(focusRule()).toMatch(/outline:\s*3px solid var\(--focus-ring, var\(--color-brand\)\)/);
  });

  it("appears immediately: no colour transition reaches the outline", () => {
    const property = focusRule().match(/transition-property:\s*([^;]+);/)?.[1];
    expect(property, "the focus rule must set transition-property").toBeDefined();
    const names = property!.split(",").map((p) => p.trim());
    expect(names.filter((n) => n.startsWith("outline") || n === "all")).toEqual([]);
    // The utilities it overrides still transition their colours.
    expect(names).toEqual(expect.arrayContaining(["color", "background-color", "border-color"]));
  });
});

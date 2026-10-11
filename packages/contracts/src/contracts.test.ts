import { describe, expect, it } from "vitest";
import { isSignalTag, SIGNAL_TAGS } from "./index";

describe("signal tags", () => {
  it("are unique snake_case identifiers", () => {
    expect(new Set(SIGNAL_TAGS).size).toBe(SIGNAL_TAGS.length);
    for (const tag of SIGNAL_TAGS) expect(tag).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it("recognises known tags only", () => {
    expect(isSignalTag("pelvic_obliquity")).toBe(true);
    expect(isSignalTag("Pelvic Obliquity")).toBe(false);
  });
});

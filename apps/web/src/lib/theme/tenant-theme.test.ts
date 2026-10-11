import { describe, expect, it } from "vitest";
import { contrast, mix } from "./contrast";
import { BASE_ATTRIBUTION, contrastChecks, derived, FIXED, themeStyle, validateTheme } from "./tenant-theme";

import { LIGHT_SAGE, OXBLOOD, SAGE } from "./preview-brands";

describe("contrast", () => {
  it("matches WCAG reference values", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrast("#FFFFFF", "#FFFFFF")).toBe(1);
    // #767676 is the lightest grey that passes 4.5:1 on white; #777777 just fails.
    expect(contrast("#767676", "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#777777", "#FFFFFF")).toBeLessThan(4.5);
  });

  it("is symmetric, and mixes toward the second colour", () => {
    expect(contrast("#2453D4", "#F6F8FB")).toBeCloseTo(contrast("#F6F8FB", "#2453D4"), 10);
    expect(mix("#000000", "#FFFFFF", 0.5)).toBe("#808080");
    expect(mix("#7A1F2B", "#FFFFFF", 0)).toBe("#7a1f2b");
  });

  it("refuses anything that is not a #RRGGBB colour", () => {
    expect(() => contrast("red", "#FFFFFF")).toThrow();
    expect(() => contrast("#FFF", "#FFFFFF")).toThrow();
  });
});

describe("validateTheme", () => {
  it.each([["oxblood barbell gym", OXBLOOD], ["sage pilates studio", SAGE]])("accepts the %s: every pair and state passes AA", (_, theme) => {
    const result = validateTheme(theme);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(new Set(result.checks.map((c) => c.state))).toEqual(new Set(["default", "hover", "selected", "focus", "error"]));
    expect(result.checks.every((c) => c.ratio >= c.minimum)).toBe(true);
  });

  it("refuses a light sage that fails as link text, selected text and focus ring", () => {
    const result = validateTheme(LIGHT_SAGE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.join("\n")).toMatch(/Link on surface \(default\): 2\.\d+:1, needs 4\.5:1/);
    expect(result.problems.join("\n")).toMatch(/Focus ring on canvas \(focus\)/);
    expect(result.problems.join("\n")).toMatch(/Selected control \(selected\)/);
  });

  it("refuses on-accent text that is unreadable on the accent", () => {
    const result = validateTheme({ ...OXBLOOD, onAccent: "#5A1A20" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.some((p) => p.startsWith("Selected control (selected)"))).toBe(true);
  });

  it("checks the hover state separately from the default state", () => {
    // Black text passes on this mid green, but not once hover darkens the fill.
    const checks = contrastChecks({ accent: "#3C8A5A", onAccent: "#000000", mark: { kind: "text" } });
    const selected = checks.find((c) => c.role === "Selected control" && c.state === "selected")!;
    const hover = checks.find((c) => c.role === "Selected control" && c.state === "hover")!;
    expect(selected.pass).toBe(true);
    expect(hover.pass).toBe(false);
    expect(validateTheme({ ...SAGE, accent: "#3C8A5A", onAccent: "#000000" }).ok).toBe(false);
  });

  it("checks the text mark only when the mark is text", () => {
    const raster = { kind: "raster", src: "/media/org/00000000-0000-4000-8000-000000000001/brand/logo.png", width: 240, height: 80 } as const;
    expect(contrastChecks({ ...OXBLOOD, mark: { kind: "text" } }).some((c) => c.role === "Text mark in the header")).toBe(true);
    expect(contrastChecks({ ...OXBLOOD, mark: raster }).some((c) => c.role === "Text mark in the header")).toBe(false);
    expect(validateTheme({ ...OXBLOOD, mark: raster }).ok).toBe(true);
  });

  it.each([
    ["the science colour", { science: "#FF0000" }],
    ["the practice colour", { practice: "#FF0000" }],
    ["the danger colour", { danger: "#FF0000" }],
    ["the caution colour", { caution: "#FF0000" }],
    ["the attribution line", { attribution: "Our own curriculum" }],
    ["arbitrary CSS", { css: "body{display:none}" }],
  ])("cannot override %s", (_, extra) => {
    expect(validateTheme({ ...OXBLOOD, ...extra }).ok).toBe(false);
  });

  it.each([
    ["a named colour", { accent: "red" }],
    ["a short hex", { accent: "#F00" }],
    ["a CSS expression", { accent: "var(--color-science)" }],
    ["markup in the name", { name: "<b>Gym</b>" }],
    ["a link in the name", { name: "Visit https://example.com" }],
    ["an empty name", { name: "  " }],
    ["a font that is not bundled", { font: "comic-sans" }],
    ["an SVG logo", { mark: { kind: "raster", src: "/media/org/00000000-0000-4000-8000-000000000001/brand/logo.svg", width: 100, height: 40 } }],
    ["an external logo", { mark: { kind: "raster", src: "https://example.com/logo.png", width: 100, height: 40 } }],
    ["a logo outside the brand folder", { mark: { kind: "raster", src: "/media/org/00000000-0000-4000-8000-000000000001/../logo.png", width: 100, height: 40 } }],
  ])("refuses %s", (_, patch) => {
    expect(validateTheme({ ...OXBLOOD, ...patch }).ok).toBe(false);
  });
});

describe("themeStyle", () => {
  it("emits only the tenant variables and the focus ring, from validated colours", () => {
    const result = validateTheme(OXBLOOD);
    if (!result.ok) throw new Error("fixture must pass");
    const style = themeStyle(result.theme);
    expect(Object.keys(style).sort()).toEqual(["--focus-ring", "--tenant-accent", "--tenant-accent-hover", "--tenant-accent-soft", "--tenant-on-accent"]);
    expect(Object.values(style).every((v) => /^#[0-9a-fA-F]{6}$/.test(v))).toBe(true);
    expect(style["--tenant-accent-hover"]).toBe(derived(OXBLOOD).accentHover);
  });

  it("leaves the evidence colours and the attribution fixed", () => {
    expect(FIXED.science).toBe("#0B6B50");
    expect(FIXED.practice).toBe("#8A4B10");
    expect(BASE_ATTRIBUTION).toBe("Base curriculum by Spindle, cited");
  });
});

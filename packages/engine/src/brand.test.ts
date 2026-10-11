import { describe, expect, it } from "vitest";
import { ATLAS, BASE_ATTRIBUTION, brandChecks, brandToCssVars, validateBrand } from "./brand";
import { contrast } from "./contrast";

// Synthetic brands only: no real gym, coach, name or logo.
const OXBLOOD = { name: "Example Barbell Club", mark: { kind: "text" }, colors: { accent: "#7A1F2B", onAccent: "#FFFFFF" }, font: "barlow-condensed" } as const;
const SAGE = { name: "Example Pilates Studio", mark: { kind: "text" }, colors: { accent: "#506E4B", onAccent: "#FFFFFF" }, font: "fraunces" } as const;
const LIGHT_SAGE = { ...SAGE, name: "Example Studio (light sage)", colors: { accent: "#9CAF88", onAccent: "#FFFFFF" } } as const;
const LOGO = { kind: "logo", key: "barbell-mark.png", format: "png", width: 240, height: 80, bytes: 24_000 } as const;

describe("validateBrand", () => {
  it.each([["oxblood", OXBLOOD], ["sage", SAGE]])("accepts the %s brand: every pair in every state passes AA", (_, brand) => {
    const r = validateBrand(brand);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(new Set(r.checks.map((c) => c.state))).toEqual(new Set(["default", "hover", "selected", "focus", "error"]));
    expect(r.checks.every((c) => c.ratio >= c.minimum)).toBe(true);
  });

  it("refuses a light accent that fails as link text, selected text and focus ring", () => {
    const r = validateBrand(LIGHT_SAGE);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const text = r.problems.join("\n");
    expect(text).toMatch(/Link on surface \(default\): 2\.\d\d:1, needs 4\.5:1/);
    expect(text).toMatch(/Selected control \(selected\)/);
    expect(text).toMatch(/Focus ring on canvas \(focus\)/);
  });

  it("decides on the exact ratio and shows it rounded down: 4.4997:1 fails", () => {
    expect(contrast("#84B7A0", "#7A1F2B")).toBeLessThan(4.5);
    const r = validateBrand({ ...OXBLOOD, colors: { accent: "#7A1F2B", onAccent: "#84B7A0" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join("\n")).toMatch(/Selected control \(selected\): 4\.49:1, needs 4\.5:1/);
  });

  it("checks every place the brand colours are drawn, in the app's real backgrounds", () => {
    const checks = brandChecks(OXBLOOD);
    const roles = checks.map((c) => `${c.role}|${c.state}|${c.background}`);
    for (const bg of [ATLAS.surface, ATLAS.canvas, ATLAS.surfaceMuted]) {
      expect(roles.some((r) => r.startsWith(`Link on`) && r.endsWith(`|default|${bg}`))).toBe(true);
      expect(roles.some((r) => r.startsWith(`Link on`) && r.endsWith(`|hover|${bg}`))).toBe(true);
    }
    // The focus ring is checked against every surface it can sit on, including the current-lesson marker and an error panel.
    const ringBackgrounds = checks.filter((c) => c.state === "focus").map((c) => c.background);
    for (const bg of [ATLAS.canvas, ATLAS.surface, ATLAS.surfaceMuted, ATLAS.dangerSoft]) expect(ringBackgrounds).toContain(bg);
    expect(checks.some((c) => c.role === "Current lesson marker" && c.state === "selected")).toBe(true);
    expect(checks.some((c) => c.role === "Muted text on the current lesson marker")).toBe(true);
    expect(checks.some((c) => c.role === "Selected control" && c.state === "hover")).toBe(true);
    expect(checks.filter((c) => c.state === "error").every((c) => c.foreground === ATLAS.danger)).toBe(true);
  });

  it("checks the text mark only when the mark is text", () => {
    expect(brandChecks(OXBLOOD).some((c) => c.role === "Text mark in the header")).toBe(true);
    expect(brandChecks({ ...OXBLOOD, mark: LOGO }).some((c) => c.role === "Text mark in the header")).toBe(false);
    expect(validateBrand({ ...OXBLOOD, mark: LOGO }).ok).toBe(true);
  });

  it.each([
    ["the science colour", { science: "#FF0000" }],
    ["the practice colour", { practice: "#FF0000" }],
    ["the danger colour", { danger: "#FF0000" }],
    ["a review status", { reviewStatus: "Reviewed by a PT" }],
    ["the attribution line", { attribution: "Our own curriculum" }],
    ["a practice label", { practiceLabel: "Proven" }],
    ["arbitrary CSS", { css: "body{display:none}" }],
    ["an extra colour token", { colors: { accent: "#7A1F2B", onAccent: "#FFFFFF", science: "#FF0000" } }],
  ])("cannot override %s", (_, extra) => {
    expect(validateBrand({ ...OXBLOOD, ...extra }).ok).toBe(false);
  });

  it.each([
    ["a named colour", { colors: { accent: "red", onAccent: "#FFFFFF" } }],
    ["a short hex", { colors: { accent: "#F00", onAccent: "#FFFFFF" } }],
    ["a CSS variable", { colors: { accent: "var(--color-science)", onAccent: "#FFFFFF" } }],
    ["markup in the name", { name: "<b>Gym</b>" }],
    ["a link in the name", { name: "Visit https://example.com" }],
    ["a control character in the name", { name: "Gym\u0007" }],
    ["an empty name", { name: "   " }],
    ["a font that is not bundled", { font: "comic-sans" }],
    ["an SVG logo", { mark: { ...LOGO, key: "mark.svg", format: "svg" } }],
    ["a logo URL", { mark: { ...LOGO, key: "https://example.com/mark.png" } }],
    ["a logo path", { mark: { ...LOGO, key: "../other-org/mark.png" } }],
    ["a logo whose extension and format disagree", { mark: { ...LOGO, key: "mark.webp" } }],
    ["an oversized logo file", { mark: { ...LOGO, bytes: 600_000 } }],
    ["a logo with an extreme aspect ratio", { mark: { ...LOGO, width: 2000, height: 16 } }],
  ])("refuses %s", (_, patch) => {
    expect(validateBrand({ ...OXBLOOD, ...patch }).ok).toBe(false);
  });
});

describe("brandToCssVars", () => {
  it("maps a validated brand onto the Atlas brand tokens and the focus ring, with literal colours only", () => {
    const r = validateBrand(OXBLOOD);
    if (!r.ok) throw new Error("fixture must pass");
    const vars = brandToCssVars(r.brand);
    expect(Object.keys(vars).sort()).toEqual(["--color-brand", "--color-brand-hover", "--color-brand-soft", "--color-on-brand", "--focus-ring"]);
    expect(Object.values(vars).every((v) => /^#[0-9a-f]{6}$/i.test(v))).toBe(true);
    expect(vars["--color-brand"]!.toLowerCase()).toBe("#7a1f2b");
    expect(vars["--focus-ring"]).toBe(vars["--color-brand"]);
  });

  it("refuses anything that did not come out of validateBrand", () => {
    expect(() => brandToCssVars(OXBLOOD as never)).toThrow();
    expect(() => brandToCssVars({ ...OXBLOOD, colors: { accent: "red;}body{x:y", onAccent: "#FFFFFF" } } as never)).toThrow();
  });

  it("leaves the evidence colours and the attribution outside the brand", () => {
    expect(ATLAS.science).toBe("#0b6b50");
    expect(ATLAS.practice).toBe("#8a4b10");
    expect(BASE_ATTRIBUTION).toBe("Base curriculum by Spindle, cited");
  });
});

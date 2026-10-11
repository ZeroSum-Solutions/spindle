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

  it.each([["Café Fitness"], ["한국 체육관"], ["Gym ❤️"], ["Ünïcode 24/7"]])("accepts the real name %s", (name) => {
    expect(validateBrand({ ...OXBLOOD, name }).ok).toBe(true);
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
    ["a zero-width-only name", { name: "\u200B" }],
    ["an invisible name of format characters", { name: "\u2060\uFEFF" }],
    ["a C1 control in the name", { name: "Gym\u0085name" }],
    ["bidi overrides in the name", { name: "Gym\u202Espin\u202C" }],
    ["a bidi isolate in the name", { name: "Gym\u2066x\u2069" }],
    // Fillers that Unicode classes as letters or symbols but that draw nothing.
    ["a name of Hangul choseong fillers", { name: "\u115F\u115F" }],
    ["a name of Hangul jungseong fillers", { name: "\u1160\u1160" }],
    ["a name of Hangul fillers", { name: "\u3164\u3164" }],
    ["a name of halfwidth Hangul fillers", { name: "\uFFA0\uFFA0" }],
    ["a name of Braille blanks", { name: "\u2800\u2800" }],
    ["a name of mixed blank fillers", { name: "\u3164 \u2800 \uFFA0" }],
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

describe("a validated brand cannot change afterwards", () => {
  it("freezes the brand, its colours and its mark", () => {
    const r = validateBrand({ ...OXBLOOD, mark: LOGO });
    if (!r.ok) throw new Error("fixture must pass");
    expect(Object.isFrozen(r.brand)).toBe(true);
    expect(Object.isFrozen(r.brand.colors)).toBe(true);
    expect(Object.isFrozen(r.brand.mark)).toBe(true);
    expect(() => {
      (r.brand.mark as { key: string }).key = "https://example.com/x.svg";
    }).toThrow();
    expect(r.brand.mark).toMatchObject({ key: "barbell-mark.png" });
  });
});

describe("the P4-A2 header band", () => {
  const base = { mark: { kind: "text" }, colors: { accent: "#7A1F2B", onAccent: "#FFFFFF" }, font: "geist", name: "Example Barbell Club" } as const;
  it("defaults to the Spindle surface with ink on it", () => {
    const r = validateBrand(base);
    expect(r.ok).toBe(true);
    const band = r.checks.find((c) => c.role === "Brand name on the band")!;
    expect([band.foreground, band.background]).toEqual([ATLAS.ink, ATLAS.surface]);
  });
  it("puts white on a dark band and ink on a light one", () => {
    expect(brandChecks({ ...base, colors: { ...base.colors, band: "#0B3D2E" } }).find((c) => c.role === "Brand name on the band")!.foreground).toBe("#ffffff");
    expect(brandChecks({ ...base, colors: { ...base.colors, band: "#F2E8D5" } }).find((c) => c.role === "Brand name on the band")!.foreground).toBe(ATLAS.ink);
  });
  it("refuses a band on which neither ink nor white reaches 4.5:1", () => {
    // Pressroom ink (#111111) reaches 4.5:1 on mid greys Atlas ink did not, so the boundary grey is #777777.
    const r = validateBrand({ ...base, colors: { ...base.colors, band: "#777777" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join("\n")).toMatch(/Brand name on the band \(default\): 4\.47:1, needs 4\.5:1/);
  });
  it("checks chip text on the band tint", () => {
    const checks = brandChecks({ ...base, colors: { ...base.colors, band: "#0B3D2E" } });
    const chip = checks.find((c) => c.role === "Chip text on the band tint")!;
    expect(chip.background).not.toBe("#0b3d2e");
    expect(chip.pass).toBe(true);
  });
});

describe("validateOrgBrand (the stored brand)", () => {
  it("accepts a text-mark brand with a band and refuses a name, a logo and a failing band", async () => {
    const { validateOrgBrand } = await import("./brand");
    const ok = { mark: { kind: "text" }, colors: { accent: "#506E4B", onAccent: "#FFFFFF", band: "#0B3D2E" }, font: "fraunces" };
    expect(validateOrgBrand(ok).ok).toBe(true);
    expect(validateOrgBrand({ ...ok, name: "x" }).ok).toBe(false);
    expect(validateOrgBrand({ ...ok, mark: { kind: "logo" } }).ok).toBe(false);
    const grey = validateOrgBrand({ ...ok, colors: { ...ok.colors, band: "#777777" } });
    expect(grey.ok).toBe(false);
    if (!grey.ok) expect(grey.problems[0]).toBe("Brand name on the band (default): 4.47:1, needs 4.5:1");
  });
});

describe("heroChipCheck", () => {
  it("is the chip pair brandChecks lists, for any band", async () => {
    const { heroChipCheck } = await import("./brand");
    for (const band of [undefined, "#0B3D2E", "#F2E8D5", "#808080"]) {
      const colors = { accent: "#1F4E8C", onAccent: "#FFFFFF", ...(band ? { band } : {}) };
      const listed = brandChecks({ colors, mark: { kind: "text" } }).find((c) => c.role === "Chip text on the band tint");
      expect(heroChipCheck(colors)).toEqual(listed);
    }
  });
});

import { describe, expect, it } from "vitest";
import { BASE_ATTRIBUTION, MIN_DISTANCE, PALETTE, brandChecks, brandToCssVars, brandTokens, validateBrand } from "./brand";
import { contrast, mix } from "./contrast";

// Synthetic brands only: no real gym, coach, name or logo. Lab has a light and a dark theme, so a gym
// sets an accent pair per theme: a deep accent with white text for light, a light accent with midnight text for dark.
const OXBLOOD = { name: "Example Barbell Club", mark: { kind: "text" }, colors: { accent: "#7A1F2B", onAccent: "#FFFFFF", accentDark: "#F2877E", onAccentDark: "#0B0D12" }, font: "barlow-condensed" } as const;
const HARBOR = { name: "Example Pilates Studio", mark: { kind: "text" }, colors: { accent: "#1F4E8C", onAccent: "#FFFFFF", accentDark: "#7AB8FF", onAccentDark: "#0B0D12" }, font: "fraunces" } as const;
const PALE_SAGE = { ...HARBOR, name: "Example Studio (pale sage)", colors: { accent: "#9CAF88", onAccent: "#FFFFFF", accentDark: "#B5CFA8", onAccentDark: "#0B0D12" } } as const;
const role = (theme: "light" | "dark", name: string) => `${theme === "light" ? "Light" : "Dark"} theme: ${name}`;
const LOGO = { kind: "logo", key: "barbell-mark.png", format: "png", width: 240, height: 80, bytes: 24_000 } as const;

describe("validateBrand", () => {
  it.each([["oxblood", OXBLOOD], ["harbor", HARBOR]])("accepts the %s brand: every pair in every state passes AA", (_, brand) => {
    const r = validateBrand(brand);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(new Set(r.checks.map((c) => c.state))).toEqual(new Set(["default", "hover", "selected", "focus", "error", "distinct"]));
    expect(r.checks.every((c) => c.ratio >= c.minimum)).toBe(true);
    expect(new Set(r.checks.map((c) => c.theme))).toEqual(new Set(["light", "dark"]));
  });

  it("checks the same pairs in both themes, each against its own palette", () => {
    const checks = brandChecks(OXBLOOD);
    const light = checks.filter((c) => c.theme === "light");
    const dark = checks.filter((c) => c.theme === "dark");
    expect(light.length).toBe(dark.length);
    expect(light.map((c) => c.role.replace("Light theme: ", ""))).toEqual(dark.map((c) => c.role.replace("Dark theme: ", "")));
    expect(light.find((c) => c.role === role("light", "Link on surface"))!.foreground).toBe("#7a1f2b");
    expect(dark.find((c) => c.role === role("dark", "Link on surface"))!.foreground).toBe("#f2877e");
    expect(dark.find((c) => c.role === role("dark", "Link on surface"))!.background).toBe(PALETTE.dark.surface);
  });

  it("refuses a pale light-theme accent on white, though its dark pair passes", () => {
    const r = validateBrand(PALE_SAGE);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problems.every((p) => p.startsWith("Light theme: "))).toBe(true);
    expect(r.problems.join("\n")).toMatch(/Light theme: Link on surface \(default\): 2\.\d\d:1, needs 4\.5:1/);
  });

  it("refuses one accent for both themes: it cannot be link text on white and on graphite", () => {
    const r = validateBrand({ ...OXBLOOD, colors: { ...OXBLOOD.colors, accentDark: "#7A1F2B", onAccentDark: "#FFFFFF" } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problems.every((p) => p.startsWith("Dark theme: "))).toBe(true);
    expect(r.problems.join("\n")).toMatch(/Dark theme: Link on surface \(default\): 1\.\d\d:1, needs 4\.5:1/);
  });

  it("requires an accent pair for each theme", () => {
    const { accentDark: _a, onAccentDark: _b, ...lightOnly } = OXBLOOD.colors;
    expect(validateBrand({ ...OXBLOOD, colors: lightOnly }).ok).toBe(false);
  });

  it("decides on the exact ratio and shows it rounded down: 4.49998:1 fails", () => {
    expect(contrast("#593300", "#F2877E")).toBeLessThan(4.5);
    expect(contrast("#593300", "#F2877E")).toBeGreaterThan(4.4999);
    const r = validateBrand({ ...OXBLOOD, colors: { ...OXBLOOD.colors, onAccentDark: "#593300" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems).toContain("Dark theme: Selected control (selected): 4.49:1, needs 4.5:1");
  });

  it("checks every place the brand colours are drawn, in the app's real backgrounds", () => {
    for (const theme of ["light", "dark"] as const) {
      const p = PALETTE[theme];
      const checks = brandChecks(OXBLOOD).filter((c) => c.theme === theme);
      const roles = checks.map((c) => `${c.role}|${c.state}|${c.background}`);
      for (const bg of [p.surface, p.canvas, p.surfaceMuted]) {
        expect(roles.some((r) => r.startsWith(role(theme, "Link on")) && r.endsWith(`|default|${bg}`))).toBe(true);
        expect(roles.some((r) => r.startsWith(role(theme, "Link on")) && r.endsWith(`|hover|${bg}`))).toBe(true);
      }
      // The focus ring is checked against every surface it can sit on, including the current-lesson marker and an error panel.
      const ringBackgrounds = checks.filter((c) => c.state === "focus").map((c) => c.background);
      for (const bg of [p.canvas, p.surface, p.surfaceMuted, p.dangerSoft]) expect(ringBackgrounds).toContain(bg);
      expect(checks.some((c) => c.role === role(theme, "Current lesson marker") && c.state === "selected")).toBe(true);
      expect(checks.some((c) => c.role === role(theme, "Muted text on the current lesson marker"))).toBe(true);
      expect(checks.some((c) => c.role === role(theme, "Selected control") && c.state === "hover")).toBe(true);
      expect(checks.filter((c) => c.state === "error").every((c) => c.foreground === p.danger)).toBe(true);
      // Source links sit on the evidence washes (Sol plan audit): link, hover and focus are checked there too.
      for (const bg of [p.scienceSoft, p.practiceSoft, p.cautionSoft]) {
        expect(checks.filter((c) => c.background === bg).map((c) => c.state).sort()).toEqual(["default", "focus", "hover"]);
      }
    }
  });

  it.each([["Café Fitness"], ["한국 체육관"], ["Gym ❤️"], ["Ünïcode 24/7"]])("accepts the real name %s", (name) => {
    expect(validateBrand({ ...OXBLOOD, name }).ok).toBe(true);
  });

  it("checks the text mark only when the mark is text", () => {
    expect(brandChecks(OXBLOOD).filter((c) => c.role.endsWith("Text mark in the header"))).toHaveLength(2);
    expect(brandChecks({ ...OXBLOOD, mark: LOGO }).some((c) => c.role.endsWith("Text mark in the header"))).toBe(false);
    expect(validateBrand({ ...OXBLOOD, mark: LOGO }).ok).toBe(true);
  });

  it.each([
    ["dark", "Spindle signal", { accentDark: "#FF69B4", onAccentDark: "#0B0D12" }],
    ["dark", "Science", { accentDark: "#2DD4BF", onAccentDark: "#0B0D12" }],
    ["dark", "Practice-based", { accentDark: "#FB923C", onAccentDark: "#0B0D12" }],
    ["light", "Spindle signal", { accent: "#B5175C", onAccent: "#FFFFFF" }],
    ["light", "Practice-based", { accent: "#A3312B", onAccent: "#FFFFFF" }],
  ] as const)("refuses a %s accent too close to %s, though every contrast pair passes", (theme, name, patch) => {
    const r = validateBrand({ ...OXBLOOD, colors: { ...OXBLOOD.colors, ...patch } });
    expect(r.checks.filter((c) => c.state !== "distinct").every((c) => c.pass)).toBe(true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems).toEqual([expect.stringMatching(new RegExp(`^${role(theme, `Accent distinct from ${name}`)}: distance 0\\.0\\d\\d, needs 0\\.100$`))]);
  });

  it("measures distance in OKLab against the signal and both evidence colours of each theme", () => {
    for (const theme of ["light", "dark"] as const) {
      const p = PALETTE[theme];
      const distinct = brandChecks(OXBLOOD).filter((c) => c.state === "distinct" && c.theme === theme);
      expect(distinct.map((c) => c.background)).toEqual([p.signal, p.science, p.practice]);
      expect(distinct.every((c) => c.minimum === MIN_DISTANCE && c.pass)).toBe(true);
    }
    // The signal itself, as a gym accent, is refused: a gym cannot borrow Spindle's place colour.
    expect(validateBrand({ ...OXBLOOD, colors: { ...OXBLOOD.colors, accentDark: "#FF3B8E" } }).ok).toBe(false);
    expect(validateBrand({ ...OXBLOOD, colors: { ...OXBLOOD.colors, accent: "#C8195F" } }).ok).toBe(false);
  });

  it.each([
    ["the science colour", { science: "#FF0000" }],
    ["the practice colour", { practice: "#FF0000" }],
    ["the danger colour", { danger: "#FF0000" }],
    ["a review status", { reviewStatus: "Reviewed by a PT" }],
    ["the attribution line", { attribution: "Our own curriculum" }],
    ["a practice label", { practiceLabel: "Proven" }],
    ["arbitrary CSS", { css: "body{display:none}" }],
    ["an extra colour token", { colors: { ...OXBLOOD.colors, science: "#FF0000" } }],
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
  it("emits only literal hex values per theme, which a stylesheet rule maps onto the brand tokens and the focus ring (Sol R2 on #51)", () => {
    const r = validateBrand(OXBLOOD);
    if (!r.ok) throw new Error("fixture must pass");
    const vars = brandToCssVars(r.brand);
    expect(Object.keys(vars).sort()).toEqual(
      ["accent", "accent-hover", "accent-soft", "on-accent"].flatMap((k) => [`--brand-${k}-dark`, `--brand-${k}-light`]).sort(),
    );
    // No light-dark() or any other expression inline: browsers without native light-dark() would drop the colour and the focus ring.
    expect(Object.values(vars).every((v) => /^#[0-9a-f]{6}$/.test(v))).toBe(true);
    expect(vars["--brand-accent-light"]).toBe("#7a1f2b");
    expect(vars["--brand-accent-dark"]).toBe("#f2877e");
    // Hover moves away from the surface: darker in light, lighter in dark. The soft tint sits over each theme's surface.
    expect(vars["--brand-accent-hover-light"]).toBe(mix("#7A1F2B", "#000000", 0.15));
    expect(vars["--brand-accent-hover-dark"]).toBe(mix("#F2877E", "#FFFFFF", 0.15));
    expect(vars["--brand-accent-soft-dark"]).toBe(mix("#F2877E", PALETTE.dark.surface, 0.9));
  });

  it("refuses anything that did not come out of validateBrand", () => {
    expect(() => brandToCssVars(OXBLOOD as never)).toThrow();
    expect(() => brandToCssVars({ ...OXBLOOD, colors: { ...OXBLOOD.colors, accent: "red;}body{x:y" } } as never)).toThrow();
  });

  it("leaves the evidence colours and the attribution outside the brand", () => {
    expect([PALETTE.light.science, PALETTE.dark.science]).toEqual(["#0b6b50", "#3ddc97"]);
    expect([PALETTE.light.practice, PALETTE.dark.practice]).toEqual(["#8a4b10", "#ffb547"]);
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
  const base = OXBLOOD;
  const bandRole = (theme: "light" | "dark") => role(theme, "Brand name on the band");
  it("defaults to each theme's canvas with that theme's ink on it", () => {
    const r = validateBrand(base);
    expect(r.ok).toBe(true);
    for (const theme of ["light", "dark"] as const) {
      const band = r.checks.find((c) => c.role === bandRole(theme))!;
      expect([band.foreground, band.background]).toEqual([PALETTE[theme].text, PALETTE[theme].canvas]);
    }
  });
  it("keeps one band in both themes: light ink on a dark band, graphite on a light one", () => {
    const dark = brandChecks({ ...base, colors: { ...base.colors, band: "#0B3D2E" } });
    expect(dark.filter((c) => c.role.endsWith("Brand name on the band")).map((c) => c.foreground)).toEqual([PALETTE.dark.text, PALETTE.dark.text]);
    const light = brandChecks({ ...base, colors: { ...base.colors, band: "#F2E8D5" } });
    expect(light.filter((c) => c.role.endsWith("Brand name on the band")).map((c) => c.foreground)).toEqual([PALETTE.light.text, PALETTE.light.text]);
  });
  it("refuses a band on which neither light nor graphite ink reaches 4.5:1", () => {
    // Light ink (#f2f4f8) is 4.497:1 on #707070, where graphite (#12151c) is 3.69:1. On #5c5c5c every band pair passes,
    // chips included (the tint mixes ink in, so chips fail first: 4.497:1 on #5e5e5e's tint).
    expect(validateBrand({ ...base, colors: { ...base.colors, band: "#5C5C5C" } }).ok).toBe(true);
    expect(validateBrand({ ...base, colors: { ...base.colors, band: "#5E5E5E" } }).ok).toBe(false);
    const r = validateBrand({ ...base, colors: { ...base.colors, band: "#707070" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems).toContain("Light theme: Brand name on the band (default): 4.49:1, needs 4.5:1");
  });
  it("checks chip text on the band tint", () => {
    const checks = brandChecks({ ...base, colors: { ...base.colors, band: "#0B3D2E" } });
    const chip = checks.find((c) => c.role === role("dark", "Chip text on the band tint"))!;
    expect(chip.background).not.toBe("#0b3d2e");
    expect(chip.pass).toBe(true);
  });
});

describe("validateOrgBrand (the stored brand)", () => {
  it("accepts a text-mark brand with a band and refuses a name, a logo and a failing band", async () => {
    const { validateOrgBrand } = await import("./brand");
    const ok = { mark: { kind: "text" }, colors: { ...HARBOR.colors, band: "#0B3D2E" }, font: "fraunces" };
    expect(validateOrgBrand(ok).ok).toBe(true);
    expect(validateOrgBrand({ ...ok, name: "x" }).ok).toBe(false);
    expect(validateOrgBrand({ ...ok, mark: { kind: "logo" } }).ok).toBe(false);
    const grey = validateOrgBrand({ ...ok, colors: { ...ok.colors, band: "#707070" } });
    expect(grey.ok).toBe(false);
    if (!grey.ok) expect(grey.problems[0]).toBe("Light theme: Brand name on the band (default): 4.49:1, needs 4.5:1");
  });
});

describe("heroChipCheck", () => {
  it("is the chip pair brandChecks lists, for any band and theme", async () => {
    const { heroChipCheck } = await import("./brand");
    for (const band of [undefined, "#0B3D2E", "#F2E8D5", "#707070"]) {
      const colors = { ...HARBOR.colors, ...(band ? { band } : {}) };
      for (const theme of ["light", "dark"] as const) {
        const listed = brandChecks({ colors, mark: { kind: "text" } }).find((c) => c.role === role(theme, "Chip text on the band tint"));
        expect(heroChipCheck(colors, theme)).toEqual(listed);
      }
    }
  });
});

import { orgBrandInputSchema, tenantBrandSchema, type OrgBrandInput, type TenantBrand } from "@spindle/schema";
import { contrast, isHex, mix, oklabDistance } from "./contrast";

// Tenant brand validation (phase 4, P4-A; Lab light and dark, redesign M1). Every foreground and
// background pair the brand colours can take part in, in every state and in BOTH themes, is computed
// and must pass WCAG 2.2 AA, or the brand is refused. Pure, so it is unit-tested; the app only renders
// what this returns.

export type Theme = "light" | "dark";
export const THEMES: readonly Theme[] = ["light", "dark"];

/**
 * Spindle's fixed Lab tokens per theme, which a brand can never change (DESIGN.md; the same values as
 * the light-dark() pairs in globals.css @theme). In each theme the surfaces a brand colour can sit on run
 * from canvas to surfaceMuted (light: white is the lightest, muted the darkest; dark: canvas is the
 * darkest, muted the lightest); every other surface lies between the checked ones.
 */
export const PALETTE = {
  light: {
    canvas: "#f4f5f7",
    surface: "#ffffff",
    surfaceMuted: "#ebedf1",
    text: "#12151c",
    textMuted: "#4a5160",
    ink: "#12151c",
    onInk: "#ffffff",
    /** Spindle's signal magenta, deepened for light surfaces (4.76:1 on muted). Never a tenant colour. */
    signal: "#c8195f",
    onSignal: "#ffffff",
    science: "#0b6b50",
    scienceSoft: "#e6f4ee",
    practice: "#8a4b10",
    practiceSoft: "#fff1e0",
    caution: "#6b5300",
    cautionSoft: "#fff6d1",
    danger: "#b42318",
    dangerSoft: "#fdecea",
  },
  dark: {
    canvas: "#0b0d12",
    surface: "#181c25",
    surfaceMuted: "#20242f",
    text: "#f2f4f8",
    textMuted: "#b4bac6",
    ink: "#f2f4f8",
    onInk: "#0b0d12",
    signal: "#ff3b8e",
    onSignal: "#0b0d12",
    science: "#3ddc97",
    scienceSoft: "#192a2b",
    practice: "#ffb547",
    practiceSoft: "#292625",
    caution: "#e9d55b",
    cautionSoft: "#272927",
    danger: "#ff6b5f",
    dangerSoft: "#34252c",
  },
} as const;
export type Palette = (typeof PALETTE)[Theme];

/** The Spindle colours a gym accent must stay visibly apart from, in its own theme: the signal and the two evidence colours. */
export const DISTINCT_FROM = [
  ["Spindle signal", "signal"],
  ["Science", "science"],
  ["Practice-based", "practice"],
] as const;
/** Euclidean distance in OKLab. 0.10 refuses near-copies (hot pink against magenta, teal against Science, orange against Practice-based). */
export const MIN_DISTANCE = 0.1;

const THEME_LABEL: Record<Theme, string> = { light: "Light theme", dark: "Dark theme" };

/** Shown under every tenant brand, in fixed type and colour. Never part of a brand. */
export const BASE_ATTRIBUTION = "Base curriculum by Spindle, cited";

export interface ContrastCheck {
  /** The theme the pair is drawn in; the role starts with the same label ("Dark theme: ..."). */
  theme: Theme;
  role: string;
  /** "distinct" rows compare the accent with a Spindle colour: `ratio` holds the OKLab distance, not a contrast ratio. */
  state: "default" | "hover" | "selected" | "focus" | "error" | "distinct";
  foreground: string;
  background: string;
  /** The exact ratio. Pass and fail are decided on this value, never on a rounded one. */
  ratio: number;
  /** For display only: rounded down to two decimals, so a fail never reads as the minimum. */
  shown: string;
  /** 4.5 for text, 3 for large text and non-text indicators such as the focus ring; MIN_DISTANCE for a "distinct" check. */
  minimum: number;
  pass: boolean;
}

declare const validated: unique symbol;
/** A brand that came out of validateBrand. Only these can become CSS. */
export type ValidatedBrand = Readonly<{
  name: TenantBrand["name"];
  mark: Readonly<TenantBrand["mark"]>;
  colors: Readonly<TenantBrand["colors"]>;
  font: TenantBrand["font"];
}> & { readonly [validated]: true };
export type BrandResult = { ok: true; brand: ValidatedBrand; checks: ContrastCheck[] } | { ok: false; problems: string[]; checks: ContrastCheck[] };

const VALIDATED = new WeakSet<object>();

/** The two candidates for text on the band, whichever reads better: light ink and graphite ink. */
export const BAND_TEXT = [PALETTE.dark.text, PALETTE.light.text] as const;

/** The accent and its on-colour a theme uses: a gym sets one pair per theme, never adjusted. */
export function themeAccent(colors: TenantBrand["colors"], theme: Theme) {
  return theme === "light" ? { accent: colors.accent, onAccent: colors.onAccent } : { accent: colors.accentDark, onAccent: colors.onAccentDark };
}

/**
 * The colours a brand's inputs become in one theme. The tenant cannot set these directly. Hover moves
 * the accent away from the surface (15% toward black in light, toward white in dark); the soft tint is
 * the accent at 10% over the theme's surface. P4-A2 band tokens: the band defaults to the
 * theme's canvas; `onBand` is light or graphite ink, whichever has the higher ratio (light on a tie);
 * `bandTint` mixes onBand 12% into the band (chips); `bandEdge` mixes it 20% in (the hairline).
 */
export function brandTokens(colors: TenantBrand["colors"], theme: Theme) {
  const p = PALETTE[theme];
  const { accent, onAccent } = themeAccent(colors, theme);
  const band = (colors.band ?? p.canvas).toLowerCase();
  const [light, dark] = BAND_TEXT;
  const onBand = contrast(light, band) >= contrast(dark, band) ? light : dark;
  return {
    accent: accent.toLowerCase(),
    accentHover: mix(accent, theme === "light" ? "#000000" : "#FFFFFF", 0.15),
    accentSoft: mix(accent, p.surface, 0.9),
    onAccent: onAccent.toLowerCase(),
    band,
    onBand,
    bandTint: mix(band, onBand, 0.12),
    bandEdge: mix(band, onBand, 0.2),
  };
}
export type BrandTokens = ReturnType<typeof brandTokens>;

/** Both themes' tokens, for a scene that follows the reader's theme. */
export function themedBrandTokens(colors: TenantBrand["colors"]): Record<Theme, BrandTokens> {
  return { light: brandTokens(colors, "light"), dark: brandTokens(colors, "dark") };
}

/** A CSS value that follows the theme: light-dark(light, dark). Both must be literal hex colours. */
export function lightDark(light: string, dark: string): string {
  if (!isHex(light) || !isHex(dark)) throw new Error("light-dark values must be literal #RRGGBB colours");
  return `light-dark(${light}, ${dark})`;
}

type Pair = Omit<ContrastCheck, "ratio" | "shown" | "pass" | "theme">;

/**
 * Every pair the brand colours are drawn in, against the real Lab backgrounds they sit on, then the
 * accent's distance from Spindle's own colours: the light theme's list, then the dark theme's.
 */
export function brandChecks(brand: Pick<TenantBrand, "colors" | "mark">): ContrastCheck[] {
  return THEMES.flatMap((theme) => themeChecks(brand, theme));
}

function themeChecks(brand: Pick<TenantBrand, "colors" | "mark">, theme: Theme): ContrastCheck[] {
  const p = PALETTE[theme];
  const t = brandTokens(brand.colors, theme);
  const label = THEME_LABEL[theme];
  const backgrounds = [
    ["surface", p.surface],
    ["canvas", p.canvas],
    ["a muted panel", p.surfaceMuted],
  ] as const;
  const pairs: Pair[] = [
    ...backgrounds.map(([where, bg]) => ({ role: `Link on ${where}`, state: "default" as const, foreground: t.accent, background: bg, minimum: 4.5 })),
    ...backgrounds.map(([where, bg]) => ({ role: `Link on ${where}`, state: "hover" as const, foreground: t.accentHover, background: bg, minimum: 4.5 })),
    { role: "Current lesson marker", state: "selected", foreground: t.accent, background: t.accentSoft, minimum: 4.5 },
    // The current lesson's number and state labels keep Spindle's text colours on the brand tint.
    { role: "Muted text on the current lesson marker", state: "selected", foreground: p.textMuted, background: t.accentSoft, minimum: 4.5 },
    { role: "Text on the current lesson marker", state: "selected", foreground: p.text, background: t.accentSoft, minimum: 4.5 },
    { role: "Selected control", state: "selected", foreground: t.onAccent, background: t.accent, minimum: 4.5 },
    { role: "Selected control", state: "hover", foreground: t.onAccent, background: t.accentHover, minimum: 4.5 },
    { role: "Selected control edge", state: "selected", foreground: t.accent, background: p.surface, minimum: 3 },
    { role: "Focus ring on canvas", state: "focus", foreground: t.accent, background: p.canvas, minimum: 3 },
    { role: "Focus ring on surface", state: "focus", foreground: t.accent, background: p.surface, minimum: 3 },
    { role: "Focus ring on a muted panel", state: "focus", foreground: t.accent, background: p.surfaceMuted, minimum: 3 },
    { role: "Focus ring on the current lesson", state: "focus", foreground: t.accent, background: t.accentSoft, minimum: 3 },
    { role: "Focus ring on a field in error", state: "focus", foreground: t.accent, background: p.dangerSoft, minimum: 3 },
    // Error text stays Spindle's danger colour; it is checked where it sits beside themed controls.
    { role: "Error text on its panel", state: "error", foreground: p.danger, background: p.dangerSoft, minimum: 4.5 },
    { role: "Error text on surface", state: "error", foreground: p.danger, background: p.surface, minimum: 4.5 },
  ];
  // P4-A2 header band and catalog hero: name, nav links and chips are onBand; the focus ring there is onBand too.
  pairs.push(
    { role: "Brand name on the band", state: "default", foreground: t.onBand, background: t.band, minimum: 4.5 },
    { role: "Nav link on the band", state: "default", foreground: t.onBand, background: t.band, minimum: 4.5 },
    { role: "Chip text on the band tint", state: "default", foreground: t.onBand, background: t.bandTint, minimum: 4.5 },
    { role: "Focus ring on the band", state: "focus", foreground: t.onBand, background: t.band, minimum: 3 },
  );
  // The text mark is large (at least 20px semibold), so 3:1 applies.
  if (brand.mark.kind === "text") pairs.push({ role: "Text mark in the header", state: "default", foreground: t.accent, background: p.surface, minimum: 3 });
  const checks: ContrastCheck[] = pairs.map((pair) => {
    const ratio = contrast(pair.foreground, pair.background);
    return { theme, ...pair, role: `${label}: ${pair.role}`, ratio, shown: (Math.floor(ratio * 100) / 100).toFixed(2), pass: ratio >= pair.minimum };
  });
  // A gym accent must never read as Spindle's signal or an evidence colour (Lab, LEAD 2026-10-11).
  for (const [name, key] of DISTINCT_FROM) {
    const colour = p[key];
    const distance = oklabDistance(t.accent, colour);
    checks.push({
      theme,
      role: `${label}: Accent distinct from ${name}`,
      state: "distinct",
      foreground: t.accent,
      background: colour,
      minimum: MIN_DISTANCE,
      ratio: distance,
      shown: (Math.floor(distance * 1000) / 1000).toFixed(3),
      pass: distance >= MIN_DISTANCE,
    });
  }
  return checks;
}

/** One line per failing check: a contrast ratio, or the accent's distance from a Spindle colour. */
export function describeFailure(c: ContrastCheck): string {
  if (c.state === "distinct") return `${c.role}: distance ${c.shown}, needs ${c.minimum.toFixed(3)}`;
  return `${c.role} (${c.state}): ${c.shown}:1, needs ${c.minimum}:1`;
}

/** Parses and checks a proposed brand. Anything malformed, or any pair below AA, is refused. */
export function validateBrand(input: unknown): BrandResult {
  const parsed = tenantBrandSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, problems: parsed.error.issues.map((i) => `${i.path.join(".") || "brand"}: ${i.message}`), checks: [] };
  }
  const checks = brandChecks(parsed.data);
  const failing = checks.filter((c) => !c.pass);
  if (failing.length > 0) {
    return { ok: false, problems: failing.map(describeFailure), checks };
  }
  // Deep-frozen: the object that passed the checks is the object that becomes CSS.
  const brand = Object.freeze({
    ...parsed.data,
    mark: Object.freeze({ ...parsed.data.mark }),
    colors: Object.freeze({ ...parsed.data.colors }),
  }) as ValidatedBrand;
  VALIDATED.add(brand);
  return { ok: true, brand, checks };
}

/**
 * CSS custom properties for a validated brand, mapped onto the Lab brand tokens and the focus ring, to
 * be set on the element that scopes the brand. Each value is light-dark(light, dark) of two validated
 * literal hex colours, so the scene follows the reader's theme and nothing else reaches the stylesheet.
 */
export function brandToCssVars(brand: ValidatedBrand): Record<string, string> {
  if (!VALIDATED.has(brand)) throw new Error("brandToCssVars accepts only a brand returned by validateBrand");
  const { light, dark } = themedBrandTokens(brand.colors);
  return {
    "--color-brand": lightDark(light.accent, dark.accent),
    "--color-brand-hover": lightDark(light.accentHover, dark.accentHover),
    "--color-brand-soft": lightDark(light.accentSoft, dark.accentSoft),
    "--color-on-brand": lightDark(light.onAccent, dark.onAccent),
    "--focus-ring": lightDark(light.accent, dark.accent),
  };
}

/**
 * Checks a gym's stored brand as save_org_brand will (P4-A2): the shape, then every AA pair. The
 * database repeats both; this is the editor's answer, and brand-fixtures.ts keeps the two equal.
 */
export function validateOrgBrand(input: unknown): { ok: true; brand: OrgBrandInput; checks: ContrastCheck[] } | { ok: false; problems: string[]; checks: ContrastCheck[] } {
  const parsed = orgBrandInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, problems: parsed.error.issues.map((i) => `${i.path.join(".") || "brand"}: ${i.message}`), checks: [] };
  const checks = brandChecks(parsed.data);
  const failing = checks.filter((c) => !c.pass);
  if (failing.length > 0) return { ok: false, problems: failing.map(describeFailure), checks };
  return { ok: true, brand: parsed.data, checks };
}

/**
 * The catalog hero chip pair (spec 2.4): chip text (onBand) on the band tint, with its exact ratio
 * and verdict. brandChecks includes the same pair; this is the single call for W2's hero chips.
 */
export function heroChipCheck(colors: TenantBrand["colors"], theme: Theme): ContrastCheck {
  const t = brandTokens(colors, theme);
  const ratio = contrast(t.onBand, t.bandTint);
  return {
    theme,
    role: `${THEME_LABEL[theme]}: Chip text on the band tint`,
    state: "default",
    foreground: t.onBand,
    background: t.bandTint,
    minimum: 4.5,
    ratio,
    shown: (Math.floor(ratio * 100) / 100).toFixed(2),
    pass: ratio >= 4.5,
  };
}

import { tenantBrandSchema, type TenantBrand } from "@spindle/schema";
import { contrast, isHex, mix } from "./contrast";

// Tenant brand validation (phase 4, P4-A). Every foreground and background pair the brand
// colours can take part in, in every state, is computed and must pass WCAG 2.2 AA, or the brand
// is refused. Pure, so it is unit-tested; the app only renders what this returns.

/** Atlas tokens a brand can never change (DESIGN.md; the same values as globals.css @theme). */
export const ATLAS = {
  canvas: "#f6f8fb",
  surface: "#ffffff",
  surfaceMuted: "#edf1f5",
  text: "#17232b",
  textMuted: "#52616d",
  ink: "#17232b",
  science: "#0b6b50",
  scienceSoft: "#eaf5f0",
  practice: "#8a4b10",
  practiceSoft: "#fff3e6",
  caution: "#6b5300",
  cautionSoft: "#fff6d1",
  danger: "#b42318",
  dangerSoft: "#fff0ee",
} as const;

/** Shown under every tenant brand, in fixed type and colour. Never part of a brand. */
export const BASE_ATTRIBUTION = "Base curriculum by Spindle, cited";

export interface ContrastCheck {
  role: string;
  state: "default" | "hover" | "selected" | "focus" | "error";
  foreground: string;
  background: string;
  /** The exact ratio. Pass and fail are decided on this value, never on a rounded one. */
  ratio: number;
  /** For display only: rounded down to two decimals, so a fail never reads as the minimum. */
  shown: string;
  /** 4.5 for text, 3 for large text and non-text indicators such as the focus ring. */
  minimum: number;
  pass: boolean;
}

declare const validated: unique symbol;
/** A brand that came out of validateBrand. Only these can become CSS. */
export type ValidatedBrand = TenantBrand & { readonly [validated]: true };
export type BrandResult = { ok: true; brand: ValidatedBrand; checks: ContrastCheck[] } | { ok: false; problems: string[]; checks: ContrastCheck[] };

const VALIDATED = new WeakSet<object>();

/** The colours a brand's two inputs become. The tenant cannot set these directly. */
export function brandTokens(colors: TenantBrand["colors"]) {
  return {
    accent: colors.accent.toLowerCase(),
    accentHover: mix(colors.accent, "#000000", 0.15),
    accentSoft: mix(colors.accent, "#FFFFFF", 0.9),
    onAccent: colors.onAccent.toLowerCase(),
  };
}

type Pair = Omit<ContrastCheck, "ratio" | "shown" | "pass">;

/** Every pair the brand colours are drawn in, against the real Atlas backgrounds they sit on. */
export function brandChecks(brand: Pick<TenantBrand, "colors" | "mark">): ContrastCheck[] {
  const t = brandTokens(brand.colors);
  const backgrounds = [
    ["surface", ATLAS.surface],
    ["canvas", ATLAS.canvas],
    ["a muted panel", ATLAS.surfaceMuted],
  ] as const;
  const pairs: Pair[] = [
    ...backgrounds.map(([where, bg]) => ({ role: `Link on ${where}`, state: "default" as const, foreground: t.accent, background: bg, minimum: 4.5 })),
    ...backgrounds.map(([where, bg]) => ({ role: `Link on ${where}`, state: "hover" as const, foreground: t.accentHover, background: bg, minimum: 4.5 })),
    { role: "Current lesson marker", state: "selected", foreground: t.accent, background: t.accentSoft, minimum: 4.5 },
    // The current lesson's number and state labels keep Spindle's text colours on the brand tint.
    { role: "Muted text on the current lesson marker", state: "selected", foreground: ATLAS.textMuted, background: t.accentSoft, minimum: 4.5 },
    { role: "Text on the current lesson marker", state: "selected", foreground: ATLAS.text, background: t.accentSoft, minimum: 4.5 },
    { role: "Selected control", state: "selected", foreground: t.onAccent, background: t.accent, minimum: 4.5 },
    { role: "Selected control", state: "hover", foreground: t.onAccent, background: t.accentHover, minimum: 4.5 },
    { role: "Selected control edge", state: "selected", foreground: t.accent, background: ATLAS.surface, minimum: 3 },
    { role: "Focus ring on canvas", state: "focus", foreground: t.accent, background: ATLAS.canvas, minimum: 3 },
    { role: "Focus ring on surface", state: "focus", foreground: t.accent, background: ATLAS.surface, minimum: 3 },
    { role: "Focus ring on a muted panel", state: "focus", foreground: t.accent, background: ATLAS.surfaceMuted, minimum: 3 },
    { role: "Focus ring on the current lesson", state: "focus", foreground: t.accent, background: t.accentSoft, minimum: 3 },
    { role: "Focus ring on a field in error", state: "focus", foreground: t.accent, background: ATLAS.dangerSoft, minimum: 3 },
    // Error text stays Spindle's danger colour; it is checked where it sits beside themed controls.
    { role: "Error text on its panel", state: "error", foreground: ATLAS.danger, background: ATLAS.dangerSoft, minimum: 4.5 },
    { role: "Error text on surface", state: "error", foreground: ATLAS.danger, background: ATLAS.surface, minimum: 4.5 },
  ];
  // The text mark is large (at least 20px semibold), so 3:1 applies.
  if (brand.mark.kind === "text") pairs.push({ role: "Text mark in the header", state: "default", foreground: t.accent, background: ATLAS.surface, minimum: 3 });
  return pairs.map((p) => {
    const ratio = contrast(p.foreground, p.background);
    return { ...p, ratio, shown: (Math.floor(ratio * 100) / 100).toFixed(2), pass: ratio >= p.minimum };
  });
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
    return { ok: false, problems: failing.map((c) => `${c.role} (${c.state}): ${c.shown}:1, needs ${c.minimum}:1`), checks };
  }
  const brand = Object.freeze({ ...parsed.data, colors: Object.freeze({ ...parsed.data.colors }) }) as ValidatedBrand;
  VALIDATED.add(brand);
  return { ok: true, brand, checks };
}

/**
 * CSS custom properties for a validated brand, mapped onto the Atlas brand tokens and the focus
 * ring, to be set on the element that scopes the brand. Values are only the validated literal
 * hex colours, so nothing else can reach the stylesheet.
 */
export function brandToCssVars(brand: ValidatedBrand): Record<string, string> {
  if (!VALIDATED.has(brand)) throw new Error("brandToCssVars accepts only a brand returned by validateBrand");
  const t = brandTokens(brand.colors);
  const vars = {
    "--color-brand": t.accent,
    "--color-brand-hover": t.accentHover,
    "--color-brand-soft": t.accentSoft,
    "--color-on-brand": t.onAccent,
    "--focus-ring": t.accent,
  };
  if (!Object.values(vars).every(isHex)) throw new Error("brand colours must be literal #RRGGBB values");
  return vars;
}

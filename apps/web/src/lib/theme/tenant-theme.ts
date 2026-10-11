import { z } from "zod";
import { contrast, isHex, mix } from "./contrast";

// Tenant brand theming (phase 4 plan, section 7: theming security). Presentation only: no
// database, no uploads. A tenant may set a plain-text name, a mark, two literal colours and
// one bundled font. Everything else is fixed: the Atlas surfaces and text, the evidence
// colours (science, practice), caution and danger, and the base-curriculum attribution.
// Every pair the theme will render, in every state, must pass WCAG 2.2 AA, or the theme
// is refused. No arbitrary CSS, HTML, SVG or external URL can get in.

/** Atlas tokens a tenant can never override (DESIGN.md). */
export const FIXED = {
  canvas: "#F6F8FB",
  surface: "#FFFFFF",
  surfaceMuted: "#EDF1F5",
  text: "#17232B",
  textMuted: "#52616D",
  science: "#0B6B50",
  scienceSoft: "#EAF5F0",
  practice: "#8A4B10",
  practiceSoft: "#FFF3E6",
  caution: "#6B5300",
  cautionSoft: "#FFF6D1",
  danger: "#B42318",
  dangerSoft: "#FFF0EE",
} as const;

/** Shown under every tenant brand, in fixed type and colour. Not part of the theme. */
export const BASE_ATTRIBUTION = "Base curriculum by Spindle, cited";

/** Bundled fonts only, each self-hosted through next/font with its licence recorded. */
export const TENANT_FONTS = {
  geist: { label: "Geist", rights: "SIL Open Font License 1.1 (Vercel); bundled with the app" },
  "barlow-condensed": { label: "Barlow Condensed", rights: "SIL Open Font License 1.1 (Jeremy Tribby); self-hosted by next/font" },
  fraunces: { label: "Fraunces", rights: "SIL Open Font License 1.1 (Undercase Type); self-hosted by next/font" },
} as const;
export type TenantFont = keyof typeof TENANT_FONTS;

const hex = z.string().refine(isHex, "must be a #RRGGBB colour");

/** A display name: plain text, no markup, no links, no control characters. */
const plainName = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .refine((s) => !/[<>{}\\`]|https?:|www\.|[\u0000-\u001f\u007f]/i.test(s), "must be plain text");

/**
 * The mark: the name set in the tenant font, or a raster logo the tenant uploaded to its
 * own brand folder (PNG or WebP; SVG is refused because it can carry script). The logo
 * keeps its intrinsic proportions.
 */
const markSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("text") }),
  z.strictObject({
    kind: z.literal("raster"),
    src: z.string().regex(/^\/media\/org\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/brand\/[A-Za-z0-9_-]{1,80}\.(png|webp)$/, "must be a PNG or WebP in the gym's own brand folder"),
    width: z.number().int().min(16).max(2000),
    height: z.number().int().min(16).max(2000),
  }),
]);

export const tenantThemeSchema = z.strictObject({
  name: plainName,
  mark: markSchema,
  /** Links, the current-lesson marker, selected controls and the focus ring. */
  accent: hex,
  /** Text and icons on an accent-filled surface. */
  onAccent: hex,
  font: z.enum(Object.keys(TENANT_FONTS) as [TenantFont, ...TenantFont[]]),
});
export type TenantTheme = z.infer<typeof tenantThemeSchema>;

/** Colours derived from the tenant's two inputs. The tenant cannot set these directly. */
export function derived(theme: Pick<TenantTheme, "accent" | "onAccent">) {
  return {
    accent: theme.accent,
    accentHover: mix(theme.accent, "#000000", 0.15),
    accentSoft: mix(theme.accent, "#FFFFFF", 0.9),
    onAccent: theme.onAccent,
  };
}

export interface ContrastCheck {
  role: string;
  state: "default" | "hover" | "selected" | "focus" | "error";
  foreground: string;
  background: string;
  ratio: number;
  /** 4.5 for text, 3 for large text and non-text indicators (WCAG 2.2 AA). */
  minimum: number;
  pass: boolean;
}

/** Every foreground and background pair the theme renders, in every state. */
export function contrastChecks(theme: Pick<TenantTheme, "accent" | "onAccent" | "mark">): ContrastCheck[] {
  const t = derived(theme);
  const pairs: Omit<ContrastCheck, "ratio" | "pass">[] = [
    { role: "Link on surface", state: "default", foreground: t.accent, background: FIXED.surface, minimum: 4.5 },
    { role: "Link on canvas", state: "default", foreground: t.accent, background: FIXED.canvas, minimum: 4.5 },
    { role: "Link on surface", state: "hover", foreground: t.accentHover, background: FIXED.surface, minimum: 4.5 },
    { role: "Link on canvas", state: "hover", foreground: t.accentHover, background: FIXED.canvas, minimum: 4.5 },
    { role: "Current lesson marker", state: "selected", foreground: t.accent, background: t.accentSoft, minimum: 4.5 },
    { role: "Selected control", state: "selected", foreground: t.onAccent, background: t.accent, minimum: 4.5 },
    { role: "Selected control", state: "hover", foreground: t.onAccent, background: t.accentHover, minimum: 4.5 },
    { role: "Focus ring on canvas", state: "focus", foreground: t.accent, background: FIXED.canvas, minimum: 3 },
    { role: "Focus ring on surface", state: "focus", foreground: t.accent, background: FIXED.surface, minimum: 3 },
    { role: "Focus ring on a muted panel", state: "focus", foreground: t.accent, background: FIXED.surfaceMuted, minimum: 3 },
    { role: "Focus ring on a field in error", state: "error", foreground: t.accent, background: FIXED.dangerSoft, minimum: 3 },
    { role: "Error text beside themed controls", state: "error", foreground: FIXED.danger, background: FIXED.surface, minimum: 4.5 },
  ];
  if (theme.mark.kind === "text") pairs.push({ role: "Text mark in the header", state: "default", foreground: t.accent, background: FIXED.surface, minimum: 3 });
  return pairs.map((p) => {
    const ratio = Math.round(contrast(p.foreground, p.background) * 100) / 100;
    return { ...p, ratio, pass: ratio >= p.minimum };
  });
}

export type ThemeResult =
  | { ok: true; theme: TenantTheme; checks: ContrastCheck[] }
  | { ok: false; problems: string[]; checks: ContrastCheck[] };

/** Parses and checks a proposed theme. Anything malformed, or any pair below AA, is refused. */
export function validateTheme(input: unknown): ThemeResult {
  const parsed = tenantThemeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, problems: parsed.error.issues.map((i) => `${i.path.join(".") || "theme"}: ${i.message}`), checks: [] };
  }
  const checks = contrastChecks(parsed.data);
  const failing = checks.filter((c) => !c.pass);
  if (failing.length > 0) {
    return { ok: false, problems: failing.map((c) => `${c.role} (${c.state}): ${c.ratio}:1, needs ${c.minimum}:1`), checks };
  }
  return { ok: true, theme: parsed.data, checks };
}

/**
 * CSS custom properties for a validated theme, scoped to the element that carries them.
 * Values are only the validated hex colours, so nothing else can reach the stylesheet.
 */
export function themeStyle(theme: TenantTheme): Record<string, string> {
  const t = derived(theme);
  return {
    "--tenant-accent": t.accent,
    "--tenant-accent-hover": t.accentHover,
    "--tenant-accent-soft": t.accentSoft,
    "--tenant-on-accent": t.onAccent,
    "--focus-ring": t.accent,
  };
}

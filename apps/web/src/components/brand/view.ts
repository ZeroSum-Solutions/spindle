// View models for the P4-A2 brand components. They mirror the rev4 member DTOs and #38's
// `VersionTenantText` rows (course_title, course_blurb, welcome): every tenant text field is either
// live admitted text or null (pending, revoked or absent), so components never receive unadmitted
// text, and a later adapter only maps rows onto these fields. Pure helpers, unit-tested.
import { BRAND_VAR, PALETTE, THEMES, themedBrandTokens, TENANT_TEXT_FALLBACKS as ENGINE_FALLBACKS, validateOrgBrand, type BrandTokens, type Theme } from "@spindle/engine";
import { COVER_PATTERNS, type BrandFont, type CoverPattern, type CurriculumLayer, type ModalityTag } from "@spindle/schema";

/** Fixed Spindle text shown while a tenant slot is pending (DESIGN.md › Brand, held identity text), from the shared rule set. */
export const TENANT_TEXT_FALLBACKS = { brandName: ENGINE_FALLBACKS.brand_name, courseTitle: ENGINE_FALLBACKS.course_title } as const;

/** Display labels for the modality taxonomy (`MODALITY_TAGS` in @spindle/schema). */
export const MODALITY_LABELS: Record<ModalityTag, string> = {
  strength: "Strength",
  powerlifting: "Powerlifting",
  weightlifting: "Weightlifting",
  hypertrophy: "Hypertrophy",
  speed: "Speed",
  mobility: "Mobility",
  yoga: "Yoga",
  pilates: "Pilates",
  running: "Running",
  endurance: "Endurance",
  combat: "Combat",
  "team-sport": "Team sport",
  // Coaches learn about youth athletes; youth never use the app (P4-11).
  youth: "Youth coaching education",
};

export { COVER_PATTERNS };
export type { CoverPattern, ModalityTag };

/** A literal #RRGGBB colour, or one per Lab theme for a Spindle or accent cover that follows the theme. */
export type Paint = string | Readonly<Record<Theme, string>>;

/** Mirrors #38's `CourseCover`: a pattern and two colours, drawn by Spindle. Never an image. */
export interface CoverView {
  pattern: CoverPattern;
  background: Paint;
  /** Drawn faintly over the background. */
  foreground: Paint;
}

/** The colours a branded member page draws with: exactly what the engine's `brandTokens` derives, per Lab theme. */
export type BrandColors = Readonly<Record<Theme, BrandTokens>>;

/** One brand token in both themes, as a cover paint. */
export const paint = (colors: BrandColors, key: keyof BrandTokens): Paint => ({ light: colors.light[key], dark: colors.dark[key] });

/** A paint's two literal values. */
export const paintPair = (p: Paint): Readonly<Record<Theme, string>> => (typeof p === "string" ? { light: p, dark: p } : p);

/** A gym's brand as member pages see it. `name` is null while it is pending admission. */
export interface MemberBrandView {
  name: string | null;
  font: BrandFont;
  colors: BrandColors;
}

export interface NavLink {
  label: string;
  href: string;
}

/** Catalog hero copy. Each field is admitted text or null (pending). */
export interface CatalogHeroView {
  headline: string | null;
  tagline: string | null;
  modalities: readonly ModalityTag[];
}

export interface CourseCardView {
  id: string;
  href: string;
  layer: CurriculumLayer;
  /** The live `course_title`, or null while pending or revoked (the card shows "Untitled course"). Base and Modality titles are Spindle's. */
  title: string | null;
  /** The live `course_blurb`, or null (omitted). */
  blurb: string | null;
  tags: readonly ModalityTag[];
  /** A fixed line built by the app, e.g. "6 lessons · About 1 hour". */
  meta: string;
  /** Gym method courses only; Base and Modality always use Spindle's neutral cover. */
  cover?: CoverView;
}

/** A live `welcome` row: the admitted text and the display name frozen at publish. */
export interface CoachNoteView {
  text: string;
  /** Frozen at publish: the admitted coach name, else the admitted brand name, else the fallback. */
  displayName: string | null;
}

/**
 * A gym brand's member colours, or null when the brand is refused. The engine decides: the stored
 * brand must pass `validateOrgBrand` (every AA pair in both themes, including chip text on the band
 * tint), and the colours are `brandTokens` per theme. No colour maths here.
 */
export function memberColors(brand: unknown): BrandColors | null {
  const result = validateOrgBrand(brand);
  return result.ok ? themedBrandTokens(result.brand.colors) : null;
}

/** A gym method course with no cover of its own: diagonal in the accent (spec rev4 §2). */
export function methodDefaultCover(colors: BrandColors): CoverView {
  return { pattern: "diagonal", background: paint(colors, "accent"), foreground: paint(colors, "onAccent") };
}

const BAND_VAR = { band: "band", onBand: "on-band", bandTint: "band-tint", bandEdge: "band-edge" } as const;

/**
 * CSS custom properties for a branded member scene: literal hex per theme for the accent set and the band
 * set, to be set with `data-brand-scope` on the scene. The `[data-brand-scope]` rule in globals.css maps
 * them onto the tokens and the focus ring, so no inline light-dark() is needed (Sol R2 on #51).
 */
export function brandScopeVars(colors: BrandColors): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const theme of THEMES) {
    for (const [key, name] of Object.entries({ ...BRAND_VAR, ...BAND_VAR }) as [keyof BrandTokens, string][]) vars[`--brand-${name}-${theme}`] = colors[theme][key];
  }
  return vars;
}

export const displayName = (brand: Pick<MemberBrandView, "name">) => brand.name ?? TENANT_TEXT_FALLBACKS.brandName;
export const courseTitle = (course: Pick<CourseCardView, "title">) => course.title ?? TENANT_TEXT_FALLBACKS.courseTitle;
/** "Note from {frozen display name}", or the fixed fallback when none was frozen. */
export const noteFrom = (note: Pick<CoachNoteView, "displayName">) => note.displayName ?? TENANT_TEXT_FALLBACKS.brandName;

/** Spindle's neutral cover for Base and Modality cards: an ink pattern on surface-muted, in each theme. */
export const NEUTRAL_COVER = {
  pattern: "dots",
  background: { light: PALETTE.light.surfaceMuted, dark: PALETTE.dark.surfaceMuted },
  foreground: { light: PALETTE.light.ink, dark: PALETTE.dark.ink },
} as const satisfies CoverView;

// View models for the P4-A2 brand components. They mirror the rev4 member DTOs and #38's
// `VersionTenantText` rows (course_title, course_blurb, welcome): every tenant text field is either
// live admitted text or null (pending, revoked or absent), so components never receive unadmitted
// text, and a later adapter only maps rows onto these fields. Pure helpers, unit-tested.
import type { BrandFont, CurriculumLayer } from "@spindle/schema";
import { ATLAS, contrast, mix } from "@spindle/engine";

/**
 * Fixed Spindle text shown while a tenant slot is pending (DESIGN.md › Brand, held identity text).
 * TODO(P4-A2 W1, #38): replace with TENANT_TEXT_FALLBACKS from @spindle/schema when it lands.
 */
export const TENANT_TEXT_FALLBACKS = { brandName: "Your gym", courseTitle: "Untitled course" } as const;

/** Modality taxonomy (spec rev4 §2). TODO(P4-A2 W1): import the schema enum when it lands. */
export const MODALITY_LABELS = {
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
} as const;
export type ModalityTag = keyof typeof MODALITY_LABELS;

export const COVER_PATTERNS = ["solid", "diagonal", "grid", "dots", "rings", "waves"] as const;
export type CoverPattern = (typeof COVER_PATTERNS)[number];

/** Mirrors #38's `CourseCover`: a pattern and two literal colours, drawn by Spindle. Never an image. */
export interface CoverView {
  pattern: CoverPattern;
  /** #RRGGBB */
  background: string;
  /** #RRGGBB, drawn faintly over the background. */
  foreground: string;
}

/** The colours a branded member page draws with, already validated (accent pairs by validateBrand). */
export interface BrandColors {
  accent: string;
  onAccent: string;
  accentSoft: string;
  band: string;
  onBand: string;
  bandTint: string;
  bandEdge: string;
}

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
 * The band and its derived tokens (DESIGN.md › Colors): on-band is ink or white, whichever has
 * more contrast; tint and edge mix on-band 12% and 20% into the band. Null when even the better
 * on-band is under 4.5:1, because such a band is refused.
 * TODO(P4-A2 W1): use brandTokens from @spindle/engine once it derives the band.
 */
export function bandTokens(band: string): { band: string; onBand: string; bandTint: string; bandEdge: string } | null {
  const onBand = contrast(ATLAS.ink, band) >= contrast("#ffffff", band) ? ATLAS.ink : "#ffffff";
  if (contrast(onBand, band) < 4.5) return null;
  return { band, onBand, bandTint: mix(band, onBand, 0.12), bandEdge: mix(band, onBand, 0.2) };
}

/** CSS custom properties for a branded member scene: the accent set plus the band set. */
export function brandScopeVars(colors: BrandColors): Record<string, string> {
  return {
    "--color-brand": colors.accent,
    "--color-on-brand": colors.onAccent,
    "--color-brand-soft": colors.accentSoft,
    "--focus-ring": colors.accent,
    "--color-band": colors.band,
    "--color-on-band": colors.onBand,
    "--color-band-tint": colors.bandTint,
    "--color-band-edge": colors.bandEdge,
  };
}

export const displayName = (brand: Pick<MemberBrandView, "name">) => brand.name ?? TENANT_TEXT_FALLBACKS.brandName;
export const courseTitle = (course: Pick<CourseCardView, "title">) => course.title ?? TENANT_TEXT_FALLBACKS.courseTitle;
/** "Note from {frozen display name}", or the fixed fallback when none was frozen. */
export const noteFrom = (note: Pick<CoachNoteView, "displayName">) => note.displayName ?? TENANT_TEXT_FALLBACKS.brandName;

/** Spindle's neutral cover for Base and Modality cards: an ink pattern on surface-muted. */
export const NEUTRAL_COVER = { pattern: "dots", background: ATLAS.surfaceMuted, foreground: ATLAS.ink } as const satisfies CoverView;

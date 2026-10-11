// Synthetic member-catalog scenes for the test-only /brand-preview page (P4-A2 spec section 7).
// No real gym, coach or name. Every tenant text here stands for admitted text; the "pending" scene
// stands for a gym whose held texts are all pending, so the fixed fallbacks show.
import type { BrandFont } from "@spindle/schema";
import { memberColors, type BrandColors, type CatalogHeroView, type CoachNoteView, type CourseCardView, type MemberBrandView, type NavLink } from "@/components/brand/view";

export interface CatalogScene {
  id: "strength" | "pilates" | "pending" | "long-name";
  caption: string;
  brand: MemberBrandView;
  hero: CatalogHeroView;
  links: NavLink[];
  action: NavLink;
  methodCourses: CourseCardView[];
  baseCourses: CourseCardView[];
  modalityCourses: CourseCardView[];
  note: CoachNoteView | null;
}

/**
 * A scene's colours, decided by the engine: the brand must pass validateOrgBrand in both themes (as
 * save_org_brand will), and the colours are brandTokens per theme. A refused preview brand is a fixture error.
 */
function colours(name: string, font: BrandFont, colors: { accent: string; onAccent: string; accentDark: string; onAccentDark: string; band: string }): BrandColors {
  const result = memberColors({ mark: { kind: "text" }, colors, font });
  if (!result) throw new Error(`preview brand ${name} must pass validateOrgBrand`);
  return result;
}

/** The synthetic catalog brands. Their colours are shared with the e2e suite (helpers/catalog.ts). */
export const STRENGTH_COLORS = { accent: "#7a1b26", onAccent: "#ffffff", accentDark: "#f2877e", onAccentDark: "#0b0d12", band: "#17232b" } as const;
// A plum, not a green: a green accent sits too close to Science and is refused.
export const PILATES_COLORS = { accent: "#5b3a7a", onAccent: "#ffffff", accentDark: "#c3a6ff", onAccentDark: "#0b0d12", band: "#e8efe6" } as const;
const STRENGTH = colours("Example Strength Club", "barlow-condensed", STRENGTH_COLORS);
const PILATES = colours("Example Pilates Studio", "fraunces", PILATES_COLORS);

const LINKS: NavLink[] = [
  { label: "Courses", href: "#courses" },
  { label: "About the gym", href: "#about" },
];

/** Spindle's base courses, the same for every gym: titles are Spindle's, never tenant text. */
const baseCourses = (scene: string): CourseCardView[] => [
  {
    id: `${scene}-base-shoulder`,
    href: "#base-shoulder",
    layer: "base",
    title: "The shoulder complex",
    blurb: "How the shoulder is built, how it moves, and when to stop and refer.",
    tags: [],
    meta: "8 lessons",
  },
];

/** Spindle's modality courses: published by Spindle, no seal. */
const modalityCourses = (scene: string): CourseCardView[] => [
  {
    id: `${scene}-modality`,
    href: "#modality",
    layer: "modality",
    title: "Coaching mobility work",
    blurb: "Range, control and progression for mobility sessions.",
    tags: ["mobility"],
    meta: "5 lessons",
  },
];

export const CATALOG_SCENES: CatalogScene[] = [
  {
    id: "strength",
    caption: "Example Strength Club: dark band, condensed display type.",
    brand: { name: "Example Strength Club", font: "barlow-condensed", colors: STRENGTH },
    hero: { headline: "Lift well. Coach better.", tagline: "Our method for teaching the barbell.", modalities: ["strength", "powerlifting"] },
    links: LINKS,
    action: { label: "Start your first course", href: "#start" },
    methodCourses: [
      {
        id: "strength-squat",
        href: "#squat",
        layer: "method",
        title: "Squat pattern coaching",
        blurb: "How we set up, cue and progress the squat on our floor.",
        tags: ["strength"],
        meta: "6 lessons",
        cover: { pattern: "diagonal", background: STRENGTH.band, foreground: STRENGTH.onBand },
      },
      {
        id: "strength-program",
        href: "#program",
        layer: "method",
        title: "Program design basics",
        blurb: "Our weekly template and how we adjust it for each lifter.",
        tags: ["strength", "powerlifting"],
        meta: "4 lessons",
        cover: { pattern: "grid", background: STRENGTH.accent, foreground: STRENGTH.onAccent },
      },
    ],
    baseCourses: baseCourses("strength"),
    modalityCourses: modalityCourses("strength"),
    note: { text: "Learn the squat the way we teach it on our floor. Start with the setup, then the cues I use most.", displayName: "Coach A. Example" },
  },
  {
    id: "pilates",
    caption: "Example Pilates Studio: light band, serif display type.",
    brand: { name: "Example Pilates Studio", font: "fraunces", colors: PILATES },
    hero: { headline: "Move with intention.", tagline: "Teaching notes from our studio for instructors.", modalities: ["pilates", "mobility"] },
    links: LINKS,
    action: { label: "Continue where you left off", href: "#continue" },
    methodCourses: [
      {
        id: "pilates-reformer",
        href: "#reformer",
        layer: "method",
        title: "Reformer cueing",
        blurb: "The cues we use on the reformer, and when we change them.",
        tags: ["pilates"],
        meta: "5 lessons",
        cover: { pattern: "waves", background: PILATES.accentSoft, foreground: PILATES.accent },
      },
      {
        id: "pilates-breath",
        href: "#breath",
        layer: "method",
        title: "Breath and ribcage",
        blurb: "How we teach breathing before movement.",
        tags: ["pilates", "mobility"],
        meta: "3 lessons",
        cover: { pattern: "rings", background: PILATES.accent, foreground: PILATES.onAccent },
      },
      {
        id: "pilates-mat",
        href: "#mat",
        layer: "method",
        title: "Mat class structure",
        blurb: null,
        tags: [],
        meta: "4 lessons",
        // No cover of its own: the card draws the method default (diagonal in the accent).
      },
    ],
    baseCourses: baseCourses("pilates"),
    modalityCourses: modalityCourses("pilates"),
    note: { text: "Slow is the skill. I show how I cue breath before movement. Try each cue on yourself first.", displayName: "Instructor B. Example" },
  },
  {
    id: "pending",
    caption: "Pending: every held text awaits admission, so the fixed fallbacks show and the note is omitted.",
    brand: { name: null, font: "barlow-condensed", colors: STRENGTH },
    hero: { headline: null, tagline: null, modalities: ["strength"] },
    links: LINKS,
    action: { label: "Start your first course", href: "#start" },
    methodCourses: [
      { id: "pending-1", href: "#p1", layer: "method", title: null, blurb: null, tags: ["strength"], meta: "6 lessons", cover: { pattern: "solid", background: STRENGTH.band, foreground: STRENGTH.onBand } },
      { id: "pending-2", href: "#p2", layer: "method", title: null, blurb: null, tags: [], meta: "4 lessons", cover: { pattern: "diagonal", background: STRENGTH.accent, foreground: STRENGTH.onAccent } },
    ],
    baseCourses: baseCourses("pending"),
    modalityCourses: modalityCourses("pending"),
    note: null,
  },
  {
    id: "long-name",
    caption: "A 60-character unbroken name with two links: it wraps, never truncates or scrolls.",
    brand: { name: "Examplegym".repeat(6), font: "fraunces", colors: PILATES },
    hero: { headline: "Coaching notes.", tagline: null, modalities: ["youth"] },
    links: LINKS,
    action: { label: "Start your first course", href: "#start" },
    methodCourses: [
      {
        id: "long-1",
        href: "#l1",
        layer: "method",
        title: "Coaching young athletes",
        blurb: "What our coaches learn about growth, load and referral.",
        tags: ["youth"],
        meta: "4 lessons",
        cover: { pattern: "waves", background: PILATES.accentSoft, foreground: PILATES.accent },
      },
    ],
    baseCourses: [],
    modalityCourses: [],
    note: null,
  },
];

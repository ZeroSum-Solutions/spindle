import { z } from "zod";
import { courseTagsSchema } from "./runtime";

// Tenant brand (phase 4, P4-A; plan revision 2, theming security). A gym's brand is presentation
// only: a plain-text name, a text mark or a raster logo, two literal colours and one bundled font.
// Everything else stays Spindle's: the Atlas surfaces and text, the evidence colours (science,
// practice), caution and danger, review status, practice labels and the base attribution. The
// schema is strict, so any other key (a semantic colour, a label, CSS) is refused, not ignored.

/** Bundled fonts only, each self-hosted by next/font, with its licence recorded. */
export const BRAND_FONTS = {
  geist: { label: "Geist", rights: "Copyright 2024 The Geist Project Authors; SIL Open Font License 1.1 (docs/design/spindle/assets/geist-OFL.txt)" },
  "barlow-condensed": {
    label: "Barlow Condensed",
    rights: "Copyright 2017 The Barlow Project Authors; SIL Open Font License 1.1 (docs/design/spindle/assets/barlow-condensed-OFL.txt)",
  },
  fraunces: { label: "Fraunces", rights: "Copyright 2018 The Fraunces Project Authors; SIL Open Font License 1.1 (docs/design/spindle/assets/fraunces-OFL.txt)" },
} as const;
export type BrandFont = keyof typeof BRAND_FONTS;

/** Largest logo file accepted, in bytes. */
export const LOGO_MAX_BYTES = 512 * 1024;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be a #RRGGBB colour");

/**
 * Characters that draw nothing but are classed as letters or symbols: default-ignorable code points
 * (the Hangul fillers U+115F, U+1160, U+3164 and U+FFA0 among them) and the Braille blank U+2800.
 * They may appear in a name but never count as its visible text.
 */
const BLANK = /[\p{Default_Ignorable_Code_Point}\u2800]/gu;

/**
 * A display name: plain text, no markup, no links, and no invisible characters. Control characters
 * (C0, DEL, C1), format characters (zero-width spaces and joiners, word joiners, the byte-order
 * mark, bidi embeddings, overrides and isolates) and line or paragraph separators are refused,
 * and at least one visible letter, digit, punctuation mark or symbol is required (blank fillers
 * such as U+3164 and U+2800 do not count).
 */
const plainName = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .refine((s) => !/[<>{}\\`]|https?:|www\./i.test(s), "must be plain text")
  .refine((s) => !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(s), "must not contain control, format or invisible characters")
  .refine((s) => /[\p{L}\p{N}\p{P}\p{S}]/u.test(s.replace(BLANK, "")), "must contain visible text");

/**
 * A raster logo the gym uploaded to its own brand folder. Only the object's file name is stored
 * (no URL, no path): the app resolves it inside the authorized gym's folder. PNG or WebP only;
 * SVG is refused because it can carry script. Width and height are the image's intrinsic size,
 * so the logo always keeps its own proportions.
 */
const logoSchema = z
  .strictObject({
    kind: z.literal("logo"),
    key: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}\.(png|webp)$/, "must be a PNG or WebP file name in the brand folder"),
    format: z.enum(["png", "webp"]),
    width: z.number().int().min(16).max(2000),
    height: z.number().int().min(16).max(2000),
    bytes: z.number().int().min(1).max(LOGO_MAX_BYTES),
  })
  .refine((l) => l.key.endsWith(`.${l.format}`), { message: "the file extension must match the format", path: ["key"] })
  .refine((l) => l.width / l.height <= 8 && l.height / l.width <= 8, { message: "the logo's aspect ratio must be between 1:8 and 8:1", path: ["width"] });

export const tenantBrandSchema = z.strictObject({
  name: plainName,
  mark: z.discriminatedUnion("kind", [z.strictObject({ kind: z.literal("text") }), logoSchema]),
  /** The small overridable token set: literal colours only. */
  colors: z.strictObject({
    /** Light theme: links, the current-lesson marker, selected controls, the focus ring and the text mark. */
    accent: hex,
    /** Light theme: text and icons on an accent-filled control. */
    onAccent: hex,
    /** Dark theme accent. One colour cannot be link text on both white and graphite, so a gym sets one per theme. */
    accentDark: hex,
    /** Dark theme: text and icons on the dark accent fill. */
    onAccentDark: hex,
    /** P4-A2: the header band and catalog hero, the same in both themes. Absent means the theme's canvas. Text on it is light or graphite ink, whichever reads better. */
    band: hex.optional(),
  }),
  font: z.enum(Object.keys(BRAND_FONTS) as [BrandFont, ...BrandFont[]]),
});
export type TenantBrand = z.infer<typeof tenantBrandSchema>;

// P4-A2 (spec revisions 3 to 4a) ---------------------------------------------------------------

/**
 * A gym's stored brand, as save_org_brand accepts it: the text mark, literal colours (an accent pair
 * per theme and the optional header band) and one bundled font. No name (it is the held tenant text brand_name) and
 * no logo (P4-A3).
 */
export const orgBrandInputSchema = z.strictObject({
  mark: z.strictObject({ kind: z.literal("text") }),
  colors: z.strictObject({ accent: hex, onAccent: hex, accentDark: hex, onAccentDark: hex, band: hex.optional() }),
  font: z.enum(Object.keys(BRAND_FONTS) as [BrandFont, ...BrandFont[]]),
});
export type OrgBrandInput = z.infer<typeof orgBrandInputSchema>;

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, "must be a lowercase uuid");
const lowerHex = z.string().regex(/^#[0-9a-f]{6}$/, "must be a lower-case #rrggbb colour");

/**
 * MemberBrandDto (public.member_brand): what a member's pages may show of the gym. `name` is the
 * admitted brand name or "Your gym"; `texts` holds admitted catalog texts only. `brand` is null until
 * the owner saves one. Cache brand-only output under org:{orgId}:brand:{revision}.
 */
export const memberBrandDtoSchema = z.strictObject({
  orgId: uuid,
  revision: z.number().int().nonnegative(),
  name: z.string().min(1).max(60),
  nameAdmitted: z.boolean(),
  brand: z
    .strictObject({
      mark: z.strictObject({ kind: z.literal("text") }),
      colors: z.strictObject({ accent: lowerHex, onAccent: lowerHex, accentDark: lowerHex, onAccentDark: lowerHex, band: lowerHex.optional() }),
      font: z.enum(Object.keys(BRAND_FONTS) as [BrandFont, ...BrandFont[]]),
    })
    .nullable(),
  texts: z.strictObject({
    headline: z.string().min(1).max(60).optional(),
    tagline: z.string().min(1).max(140).optional(),
    coachName: z.string().min(1).max(60).optional(),
    coachRole: z.string().min(1).max(60).optional(),
  }),
});
export type MemberBrandDto = z.infer<typeof memberBrandDtoSchema>;
export const parseMemberBrandDto = (value: unknown): MemberBrandDto => memberBrandDtoSchema.parse(value);

/** The fixed layer labels on a course card (spec 2.3). Support stays per block, never a card label. */
export const LAYER_LABELS = { base: "Base", modality: "Modality", method: "Gym method" } as const;

/**
 * CourseCardDto (public.member_course_cards). Base and modality cards use Spindle's cover
 * (`cover: null`); `seal` marks base cards. A gym title whose admission was revoked reads
 * "Untitled course"; a revoked blurb leaves `summary` null.
 */
export const courseCardDtoSchema = z
  .strictObject({
    versionId: uuid,
    courseId: uuid,
    layer: z.enum(["base", "modality", "method"]),
    layerLabel: z.enum(["Base", "Modality", "Gym method"]),
    title: z.string().min(1).max(200),
    summary: z.string().min(1).max(300).nullable(),
    cover: z
      .strictObject({
        kind: z.literal("pattern"),
        pattern: z.enum(["solid", "diagonal", "grid", "dots", "rings", "waves"]),
        background: lowerHex,
        foreground: lowerHex,
      })
      .nullable(),
    tags: courseTagsSchema,
    lessonCount: z.number().int().nonnegative(),
    durationMinutes: z.number().int().nonnegative(),
    publishedBySpindle: z.boolean(),
    seal: z.boolean(),
  })
  .refine((c) => c.layerLabel === LAYER_LABELS[c.layer], { message: "layer label must match the layer", path: ["layerLabel"] })
  .refine((c) => c.layer === "method" || c.cover === null, { message: "only gym method courses carry a tenant cover", path: ["cover"] })
  .refine((c) => c.seal === (c.layer === "base") && c.publishedBySpindle === (c.layer !== "method"), {
    message: "seal and Spindle publication follow the layer",
    path: ["seal"],
  });
export type CourseCardDto = z.infer<typeof courseCardDtoSchema>;
export const parseCourseCards = (value: unknown): CourseCardDto[] => z.array(courseCardDtoSchema).max(1000).parse(value);

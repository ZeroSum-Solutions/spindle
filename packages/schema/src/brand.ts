import { z } from "zod";

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
 * A display name: plain text, no markup, no links, and no invisible characters. Control characters
 * (C0, DEL, C1), format characters (zero-width spaces and joiners, word joiners, the byte-order
 * mark, bidi embeddings, overrides and isolates) and line or paragraph separators are refused,
 * and at least one visible letter, digit, punctuation mark or symbol is required.
 */
const plainName = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .refine((s) => !/[<>{}\\`]|https?:|www\./i.test(s), "must be plain text")
  .refine((s) => !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(s), "must not contain control, format or invisible characters")
  .refine((s) => /[\p{L}\p{N}\p{P}\p{S}]/u.test(s), "must contain visible text");

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
    /** Links, the current-lesson marker, selected controls, the focus ring and the text mark. */
    accent: hex,
    /** Text and icons on an accent-filled control. */
    onAccent: hex,
  }),
  font: z.enum(Object.keys(BRAND_FONTS) as [BrandFont, ...BrandFont[]]),
});
export type TenantBrand = z.infer<typeof tenantBrandSchema>;

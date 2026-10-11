// The Lab foundations the /design kit shows, in both themes. Values mirror globals.css and DESIGN.md;
// foundations.test.ts fails if they drift, so the kit can never show a token the app does not use.

export type KitTheme = "light" | "dark";

/** Every Spindle colour token with its light and dark value. */
export const PALETTE = [
  { token: "canvas", light: "#f4f5f7", dark: "#0b0d12", role: "The page: soft grey in light, midnight in dark." },
  { token: "surface", light: "#ffffff", dark: "#181c25", role: "Cards and panels." },
  { token: "surface-muted", light: "#ebedf1", dark: "#20242f", role: "Read-only panels, hover, selected rows." },
  { token: "sheet", light: "#ffffff", dark: "#161a22", role: "The reading sheet under lesson prose." },
  { token: "text", light: "#12151c", dark: "#f2f4f8", role: "Text. Graphite in light, light ink in dark." },
  { token: "text-muted", light: "#4a5160", dark: "#b4bac6", role: "Secondary text. AAA on canvas and surface; AA (6.7:1) on the light muted panel." },
  { token: "ink", light: "#12151c", dark: "#f2f4f8", role: "Ink fills: the primary action. Inverts with the theme." },
  { token: "border", light: "#d7dbe2", dark: "#2a2f3a", role: "Hairlines only, never a control's only edge." },
  { token: "control", light: "#737a89", dark: "#6b7385", role: "Control outlines, 3:1 or more." },
  { token: "signal", light: "#c8195f", dark: "#ff3b8e", role: "Signal magenta: place, the seal, key moments. Never evidence." },
  { token: "brand", light: "#c8195f", dark: "#ff3b8e", role: "Default accent: links, current lesson, focus. A gym's pair replaces it." },
  { token: "science", light: "#0b6b50", dark: "#3ddc97", role: "Science support. Fixed; no gym can change it." },
  { token: "practice", light: "#8a4b10", dark: "#ffb547", role: "Practice-based support. Fixed." },
  { token: "caution", light: "#6b5300", dark: "#e9d55b", role: "Retracted or withdrawn evidence." },
  { token: "danger", light: "#b42318", dark: "#ff6b5f", role: "Failures only." },
  { token: "stop-panel", light: "#12151c", dark: "#f2f4f8", role: "Stop and refer: inverted against the page in each theme." },
  { token: "stop", light: "#ff6b5f", dark: "#d92d20", role: "The stop stripe on the stop-and-refer panel." },
] as const;
export type PaletteToken = (typeof PALETTE)[number]["token"] | "on-ink" | "on-signal" | "on-stop-panel" | "science-soft" | "practice-soft" | "danger-soft";

const EXTRA: Record<Exclude<PaletteToken, (typeof PALETTE)[number]["token"]>, Record<KitTheme, string>> = {
  "on-ink": { light: "#ffffff", dark: "#0b0d12" },
  "on-signal": { light: "#ffffff", dark: "#0b0d12" },
  "on-stop-panel": { light: "#f2f4f8", dark: "#0b0d12" },
  "science-soft": { light: "#e6f4ee", dark: "#192a2b" },
  "practice-soft": { light: "#fff1e0", dark: "#292625" },
  "danger-soft": { light: "#fdecea", dark: "#34252c" },
};

/** A token's value in one theme. */
export function tokenValue(token: PaletteToken, theme: KitTheme): string {
  const row = PALETTE.find((p) => p.token === token);
  return row ? row[theme] : EXTRA[token as keyof typeof EXTRA][theme];
}

/** Pairs whose ratios the kit prints in each theme (computed live with the engine's WCAG formula). */
export const CHECKED_PAIRS: readonly (readonly [PaletteToken, PaletteToken, number])[] = [
  ["text", "canvas", 4.5],
  ["text", "surface-muted", 4.5],
  ["text-muted", "surface-muted", 4.5],
  ["text-muted", "canvas", 4.5],
  ["on-ink", "ink", 4.5],
  ["signal", "surface-muted", 4.5],
  ["on-signal", "signal", 4.5],
  ["brand", "canvas", 3],
  ["science", "science-soft", 4.5],
  ["practice", "practice-soft", 4.5],
  ["danger", "danger-soft", 4.5],
  ["on-stop-panel", "stop-panel", 4.5],
  ["stop", "stop-panel", 3],
  ["control", "surface-muted", 3],
];

export const TYPE_SCALE = [
  { token: "display", phone: "36px", desktop: "76px", note: "Archivo 800, widest", sample: "Learn the body." },
  { token: "title", phone: "32px", desktop: "56px", note: "Archivo 800, widest", sample: "Shoulder anatomy a trainer needs" },
  { token: "heading", phone: "28px", desktop: "40px", note: "Archivo 800, widest", sample: "Every statement is labeled." },
  { token: "heading-lesson", phone: "28px", desktop: "48px", note: "Archivo 800, widest", sample: "Scapulohumeral rhythm" },
  { token: "section", phone: "21px", desktop: "28px", note: "Archivo 800, widest", sample: "Three bones, three joints" },
  { token: "subhead", phone: "17px", desktop: "19px", note: "Archivo 700, width 112", sample: "Which joint joins the upper arm bone to the shoulder blade?" },
  { token: "reading", phone: "18px / 1.65", desktop: "18px / 1.65", note: "Plex Sans 400, 66ch measure", sample: "Three bones make the shoulder: the upper arm bone, the shoulder blade and the collarbone." },
  { token: "ui", phone: "16px", desktop: "16px", note: "Plex Sans 500", sample: "Complete and continue" },
  { token: "label", phone: "14px", desktop: "14px", note: "Plex Sans 500", sample: "12 min read · Foundations path" },
  { token: "eyebrow", phone: "12px", desktop: "12px", note: "Plex Mono 500, caps", sample: "Lab · 02 · Fig. 2" },
  { token: "code", phone: "13px", desktop: "13px", note: "Plex Mono 400", sample: "03 / 08 · 63%" },
] as const;

export const SPACING = [
  ["hair", 4, 4],
  ["tight", 8, 8],
  ["attach", 12, 12],
  ["stack", 16, 16],
  ["block", 24, 28],
  ["group", 32, 32],
  ["safety", 40, 40],
  ["section", 56, 80],
  ["page", 64, 112],
  ["hero", 96, 128],
] as const;

export const RADII = [
  ["small", "4px"],
  ["control", "6px"],
  ["card", "8px"],
  ["plate", "10px"],
  ["pill", "9999px"],
] as const;

export const SHADOWS = ["raise", "float"] as const;

export const MOTION = [
  { token: "press", ms: 120, ease: "out", use: "Press feedback" },
  { token: "feedback", ms: 160, ease: "out", use: "Hover, colour, appear" },
  { token: "disclosure", ms: 200, ease: "out", use: "Chevron, sources tray" },
  { token: "route", ms: 260, ease: "out", use: "Route entry, rise 12px" },
  { token: "drawer", ms: 300, ease: "drawer", use: "Sheets, dock" },
  { token: "confirm", ms: 320, ease: "in-out", use: "Check stroke, segment fill" },
  { token: "reveal", ms: 480, ease: "out", use: "Scan line, ring draw" },
  { token: "step", ms: 640, ease: "in-out", use: "Anatomy step" },
  { token: "logo", ms: 720, ease: "out", use: "Wordmark reveal" },
  { token: "celebrate", ms: 1000, ease: "out", use: "Module complete, once" },
] as const;

// The Pressroom foundations the /design kit shows. Values mirror globals.css and DESIGN.md;
// foundations.test.ts fails if they drift, so the kit can never show a token the app does not use.

export const PALETTE = [
  { token: "canvas", hex: "#f3efe6", role: "Bone. The page." },
  { token: "surface", hex: "#fffdf8", role: "Paper. Cards and reading sheets." },
  { token: "surface-muted", hex: "#eee9de", role: "Read-only panels." },
  { token: "ink", hex: "#111111", role: "Text and every primary action." },
  { token: "text-muted", hex: "#4a463f", role: "Secondary text." },
  { token: "border", hex: "#d9d2c4", role: "Hairlines only, never a control outline." },
  { token: "control", hex: "#7a7468", role: "Control outlines." },
  { token: "signal", hex: "#1d2be6", role: "Pressroom Blue: bands, numerals, the seal." },
  { token: "signal-bright", hex: "#6e85ff", role: "Pressroom Blue on ink." },
  { token: "brand", hex: "#1d2be6", role: "Default accent: links, current lesson, focus. A gym's accent replaces it." },
  { token: "stop", hex: "#f04438", role: "The stop stripe on the ink stop-and-refer panel." },
  { token: "science", hex: "#0b6b50", role: "Science support. Fixed; no gym can change it." },
  { token: "practice", hex: "#8a4b10", role: "Practice-based support. Fixed." },
  { token: "caution", hex: "#6b5300", role: "Retracted or withdrawn evidence." },
  { token: "danger", hex: "#b42318", role: "Failures only." },
] as const;

/** Pairs whose ratios the kit prints (computed live with the engine's WCAG formula). */
export const CHECKED_PAIRS = [
  ["ink", "#111111", "canvas", "#f3efe6", 4.5],
  ["ink", "#111111", "surface", "#fffdf8", 4.5],
  ["text-muted", "#4a463f", "surface-muted", "#eee9de", 4.5],
  ["science", "#0b6b50", "canvas", "#f3efe6", 4.5],
  ["practice", "#8a4b10", "canvas", "#f3efe6", 4.5],
  ["danger", "#b42318", "canvas", "#f3efe6", 4.5],
  ["white", "#ffffff", "signal", "#1d2be6", 4.5],
  ["signal-bright", "#6e85ff", "ink", "#111111", 4.5],
  ["stop", "#f04438", "ink", "#111111", 3],
  ["focus ring (brand)", "#1d2be6", "canvas", "#f3efe6", 3],
  ["control", "#7a7468", "canvas", "#f3efe6", 3],
] as const;

export const TYPE_SCALE = [
  { token: "display", phone: "48px", desktop: "120px", note: "900, condensed", sample: "Learn the body." },
  { token: "title", phone: "40px", desktop: "64px", note: "900, condensed", sample: "Shoulder anatomy a trainer needs" },
  { token: "heading", phone: "36px", desktop: "56px", note: "900, condensed", sample: "Every statement is labeled." },
  { token: "section", phone: "28px", desktop: "36px", note: "800, condensed", sample: "Three bones, three joints" },
  { token: "subhead", phone: "20px", desktop: "22px", note: "700", sample: "Which joint joins the upper arm bone to the shoulder blade?" },
  { token: "reading", phone: "18px / 1.6", desktop: "18px / 1.65", note: "400, Newsreader", sample: "Three bones make the shoulder: the upper arm bone, the shoulder blade and the collarbone." },
  { token: "ui", phone: "16px", desktop: "16px", note: "500", sample: "Complete and continue" },
  { token: "label", phone: "14px", desktop: "14px", note: "500", sample: "12 min read · Foundations path" },
  { token: "eyebrow", phone: "12px", desktop: "12px", note: "600, Plex Mono, caps", sample: "02 / 05 · Fig. 2" },
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
  ["small", "2px"],
  ["control", "4px"],
  ["card", "6px"],
  ["plate", "8px"],
  ["pill", "9999px"],
] as const;

export const SHADOWS = ["raise", "float", "print"] as const;

export const MOTION = [
  { token: "press", ms: 120, ease: "out", use: "Press feedback" },
  { token: "feedback", ms: 160, ease: "out", use: "Hover, colour, appear" },
  { token: "disclosure", ms: 200, ease: "out", use: "Chevron, sources tray" },
  { token: "route", ms: 260, ease: "out", use: "Route entry, rise 12px" },
  { token: "drawer", ms: 300, ease: "drawer", use: "Sheets, dock" },
  { token: "confirm", ms: 320, ease: "in-out", use: "Check stroke, progress fill" },
  { token: "reveal", ms: 480, ease: "out", use: "Support rule draw" },
  { token: "step", ms: 640, ease: "in-out", use: "Anatomy step" },
  { token: "logo", ms: 720, ease: "out", use: "Wordmark reveal" },
  { token: "celebrate", ms: 1100, ease: "out", use: "Module complete, at most" },
] as const;

// Synthetic example brands (no real gym) for /coaches, /brand-preview and their tests. Lab has a light
// and a dark theme, so each brand sets an accent pair per theme; the engine refuses, never adjusts.
export const OXBLOOD = { name: "Example Barbell Club", mark: { kind: "text" }, colors: { accent: "#7A1F2B", onAccent: "#FFFFFF", accentDark: "#F2877E", onAccentDark: "#0B0D12" }, font: "barlow-condensed" } as const;
export const HARBOR = { name: "Example Pilates Studio", mark: { kind: "text" }, colors: { accent: "#1F4E8C", onAccent: "#FFFFFF", accentDark: "#7AB8FF", onAccentDark: "#0B0D12" }, font: "fraunces" } as const;
/** Refused: its light-theme accent is too pale for links on white, though its dark pair passes. */
export const PALE_SAGE = { ...HARBOR, name: "Example Studio (pale sage)", colors: { accent: "#9CAF88", onAccent: "#FFFFFF", accentDark: "#B5CFA8", onAccentDark: "#0B0D12" } } as const;

// Two hypothetical brands for the test-only brand preview and the /coaches swatches, and one the
// validator refuses. No real gym, coach, name or logo.
export const OXBLOOD = { name: "Example Barbell Club", mark: { kind: "text" }, colors: { accent: "#7A1F2B", onAccent: "#FFFFFF" }, font: "barlow-condensed" } as const;
export const SAGE = { name: "Example Pilates Studio", mark: { kind: "text" }, colors: { accent: "#506E4B", onAccent: "#FFFFFF" }, font: "fraunces" } as const;
export const LIGHT_SAGE = { ...SAGE, name: "Example Studio (light sage)", colors: { accent: "#9CAF88", onAccent: "#FFFFFF" } } as const;

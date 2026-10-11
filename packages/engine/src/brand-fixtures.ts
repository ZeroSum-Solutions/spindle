// One brand fixture list for both contrast implementations: brandChecks here, private.brand_checks in
// SQL. apps/web/src/lib/brand-sync.test.ts checks that supabase/tests/database/org_brand.test.sql
// carries exactly these rows (renderSqlBrandFixtures), so save_org_brand repeats the same AA checks.
import { brandChecks } from "./brand";
import { sqlLiteral } from "./tenant-text-fixtures";

interface FixtureBrand {
  mark: { kind: "text" };
  colors: { accent: string; onAccent: string; accentDark: string; onAccentDark: string; band?: string };
  font: "geist" | "barlow-condensed" | "fraunces";
}

/** Synthetic brands: no real gym. Passing, failing and boundary cases in both Lab themes, with and without a band. */
export const BRAND_FIXTURES: readonly FixtureBrand[] = [
  // Passing in both themes: a dark accent with white text for light, a light accent with midnight text for dark.
  { mark: { kind: "text" }, colors: { accent: "#7A1F2B", onAccent: "#FFFFFF", accentDark: "#F2877E", onAccentDark: "#0B0D12" }, font: "barlow-condensed" },
  { mark: { kind: "text" }, colors: { accent: "#1F4E8C", onAccent: "#FFFFFF", accentDark: "#7AB8FF", onAccentDark: "#0B0D12", band: "#0B3D2E" }, font: "fraunces" },
  // Refused in light only: a pale sage is too light for links on white.
  { mark: { kind: "text" }, colors: { accent: "#9CAF88", onAccent: "#FFFFFF", accentDark: "#B5CFA8", onAccentDark: "#0B0D12" }, font: "geist" },
  // Refused in dark only: the light theme's oxblood used again for dark is too dark for links on graphite.
  { mark: { kind: "text" }, colors: { accent: "#7A1F2B", onAccent: "#FFFFFF", accentDark: "#7A1F2B", onAccentDark: "#FFFFFF" }, font: "geist" },
  // Boundary: #593300 on #F2877E is 4.49998:1, so the dark selected control fails on the exact ratio.
  { mark: { kind: "text" }, colors: { accent: "#7A1F2B", onAccent: "#FFFFFF", accentDark: "#F2877E", onAccentDark: "#593300" }, font: "geist" },
  // A light band takes graphite text in both themes.
  { mark: { kind: "text" }, colors: { accent: "#7A1F2B", onAccent: "#FFFFFF", accentDark: "#F2877E", onAccentDark: "#0B0D12", band: "#F2E8D5" }, font: "geist" },
  // Bands: #5C5C5C passes (its chip tint is 4.63:1); on #707070 light ink is 4.497:1 and graphite 3.69:1, so it is refused.
  { mark: { kind: "text" }, colors: { accent: "#7A1F2B", onAccent: "#FFFFFF", accentDark: "#F2877E", onAccentDark: "#0B0D12", band: "#5C5C5C" }, font: "geist" },
  { mark: { kind: "text" }, colors: { accent: "#7A1F2B", onAccent: "#FFFFFF", accentDark: "#F2877E", onAccentDark: "#0B0D12", band: "#707070" }, font: "geist" },
  // Distance: every contrast pair passes, but an accent sits too close to a Spindle colour in its theme.
  { mark: { kind: "text" }, colors: { accent: "#7A1F2B", onAccent: "#FFFFFF", accentDark: "#FF69B4", onAccentDark: "#0B0D12" }, font: "geist" },
  { mark: { kind: "text" }, colors: { accent: "#7A1F2B", onAccent: "#FFFFFF", accentDark: "#2DD4BF", onAccentDark: "#0B0D12" }, font: "geist" },
  { mark: { kind: "text" }, colors: { accent: "#7A1F2B", onAccent: "#FFFFFF", accentDark: "#FB923C", onAccentDark: "#0B0D12" }, font: "geist" },
  { mark: { kind: "text" }, colors: { accent: "#B5175C", onAccent: "#FFFFFF", accentDark: "#F2877E", onAccentDark: "#0B0D12" }, font: "geist" },
  { mark: { kind: "text" }, colors: { accent: "#A3312B", onAccent: "#FFFFFF", accentDark: "#F2877E", onAccentDark: "#0B0D12" }, font: "geist" },
];

/** The values list org_brand.test.sql must carry between its markers: one row per check, in order. */
export function renderSqlBrandFixtures(fixtures: readonly FixtureBrand[] = BRAND_FIXTURES): string {
  return fixtures
    .flatMap((brand, i) =>
      brandChecks(brand).map(
        (c, k) =>
          `  (${i + 1}, ${k + 1}, ${sqlLiteral(JSON.stringify(brand))}, ${sqlLiteral(c.role)}, ${sqlLiteral(c.state)}, ${sqlLiteral(c.foreground)}, ${sqlLiteral(c.background)}, ${c.minimum}, ${c.ratio.toFixed(6)}, ${c.pass})`,
      ),
    )
    .join(",\n");
}

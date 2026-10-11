// One brand fixture list for both contrast implementations: brandChecks here, private.brand_checks in
// SQL. apps/web/src/lib/brand-sync.test.ts checks that supabase/tests/database/org_brand.test.sql
// carries exactly these rows (renderSqlBrandFixtures), so save_org_brand repeats the same AA checks.
import { brandChecks } from "./brand";
import { sqlLiteral } from "./tenant-text-fixtures";

interface FixtureBrand {
  mark: { kind: "text" };
  colors: { accent: string; onAccent: string; band?: string };
  font: "geist" | "barlow-condensed" | "fraunces";
}

/** Synthetic brands: no real gym. Passing, failing and boundary cases, with and without a band. */
export const BRAND_FIXTURES: readonly FixtureBrand[] = [
  { mark: { kind: "text" }, colors: { accent: "#7A1F2B", onAccent: "#FFFFFF" }, font: "barlow-condensed" },
  { mark: { kind: "text" }, colors: { accent: "#506E4B", onAccent: "#FFFFFF", band: "#0B3D2E" }, font: "fraunces" },
  { mark: { kind: "text" }, colors: { accent: "#9CAF88", onAccent: "#FFFFFF" }, font: "geist" },
  { mark: { kind: "text" }, colors: { accent: "#7A1F2B", onAccent: "#84B7A0" }, font: "geist" },
  { mark: { kind: "text" }, colors: { accent: "#1F4E8C", onAccent: "#FFFFFF", band: "#F2E8D5" }, font: "geist" },
  { mark: { kind: "text" }, colors: { accent: "#1F4E8C", onAccent: "#FFFFFF", band: "#808080" }, font: "geist" },
  { mark: { kind: "text" }, colors: { accent: "#1F4E8C", onAccent: "#FFFFFF", band: "#767676" }, font: "geist" },
  // Pressroom: with ink #111111, #777777 is the grey on which neither ink (4.22) nor white (4.48) reaches 4.5:1.
  { mark: { kind: "text" }, colors: { accent: "#1F4E8C", onAccent: "#FFFFFF", band: "#777777" }, font: "geist" },
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

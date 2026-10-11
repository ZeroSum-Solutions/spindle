// The brand AA checks run in @spindle/engine and again in save_org_brand. This checks the pgTAP suite
// carries the engine's exact rows for the shared fixtures (packages/engine/src/brand-fixtures.ts).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderSqlBrandFixtures } from "../../../../packages/engine/src/brand-fixtures";

const repo = (rel: string) => fileURLToPath(new URL(`../../../../${rel}`, import.meta.url));

describe("brand contrast: one fixture list for TypeScript and SQL", () => {
  it("feeds the engine's rows to the pgTAP suite", () => {
    const sql = readFileSync(repo("supabase/tests/database/org_brand.test.sql"), "utf8");
    expect(/-- brand-fixtures:begin\n(.*)\n-- brand-fixtures:end/s.exec(sql)?.[1]).toBe(renderSqlBrandFixtures());
  });
});

// The tenant text rule set and fixtures are shared by @spindle/engine and the database. These checks
// read repository files, so they live here (the engine package has no Node types).
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TENANT_TEXT_RULES } from "@spindle/engine";
import { renderSqlFixtures } from "../../../../packages/engine/src/tenant-text-fixtures";

const repo = (rel: string) => fileURLToPath(new URL(`../../../../${rel}`, import.meta.url));

describe("tenant text: one rule set and one fixture list for TypeScript and SQL", () => {
  it("is the rule set the newest tenant-text migration inserts", () => {
    const dir = repo("supabase/migrations");
    const withRules = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .filter((f) => readFileSync(`${dir}/${f}`, "utf8").includes("-- tenant-text-rules:begin"));
    expect(withRules.length).toBeGreaterThan(0);
    const body = /-- tenant-text-rules:begin\n\$rules\$(.*)\$rules\$\n-- tenant-text-rules:end/s.exec(readFileSync(`${dir}/${withRules.at(-1)}`, "utf8"));
    expect(body).not.toBeNull();
    expect(JSON.parse(body![1]!)).toEqual(TENANT_TEXT_RULES);
  });

  it("feeds the same fixtures to the pgTAP suite", () => {
    const sql = readFileSync(repo("supabase/tests/database/tenant_text.test.sql"), "utf8");
    expect(/-- fixtures:begin\n(.*)\n-- fixtures:end/s.exec(sql)?.[1]).toBe(renderSqlFixtures());
  });
});

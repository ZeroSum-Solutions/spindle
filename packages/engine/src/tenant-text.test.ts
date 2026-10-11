import { describe, expect, it } from "vitest";
import { admitTenantText, TENANT_TEXT_RULES } from "./tenant-text";
import { TENANT_TEXT_FIXTURES } from "./tenant-text-fixtures";

const ORG = "a0000000-0000-4000-8000-000000000001";

describe("admitTenantText on the shared fixtures", () => {
  it.each(TENANT_TEXT_FIXTURES.map((f, i) => [i + 1, f] as const))("fixture %i", (_n, f) => {
    const r = admitTenantText({ orgId: ORG, slot: f.slot, text: f.text });
    if (f.expect === "ok") {
      expect(r).toMatchObject({ ok: true, text: f.detail ?? f.text, version: TENANT_TEXT_RULES.version });
    } else {
      expect(r).toMatchObject({ ok: false, reason: f.expect });
      if (f.expect === "denied" || f.expect === "claim") expect(r.ok ? null : r.detail).toBe(f.detail);
    }
  });

  it("refuses a missing text and a lone surrogate", () => {
    expect(admitTenantText({ orgId: ORG, slot: "welcome", text: null })).toMatchObject({ ok: false, reason: "required" });
    expect(admitTenantText({ orgId: ORG, slot: "welcome", text: "Gym \ud800" })).toMatchObject({ ok: false, reason: "control" });
  });
});

describe("LEAD overrides", () => {
  const override = { orgId: ORG, slot: "brand_name", text: "Sports Science Lab" };
  it("admit the exact text, in that gym and slot only", () => {
    expect(admitTenantText({ orgId: ORG, slot: "brand_name", text: "Sports Science Lab" }, [override])).toMatchObject({ ok: true, overridden: true });
    expect(admitTenantText({ orgId: ORG, slot: "brand_name", text: " Sports Science Lab " }, [override])).toMatchObject({ ok: true, overridden: true });
    expect(admitTenantText({ orgId: ORG, slot: "brand_name", text: "Sports Science Lab!" }, [override])).toMatchObject({ ok: false, reason: "denied" });
    expect(admitTenantText({ orgId: ORG, slot: "catalog_headline", text: "Sports Science Lab" }, [override])).toMatchObject({ ok: false, reason: "denied" });
    expect(admitTenantText({ orgId: "b0000000-0000-4000-8000-000000000002", slot: "brand_name", text: "Sports Science Lab" }, [override])).toMatchObject({
      ok: false,
      reason: "denied",
    });
  });
  it("never lift the character and link rules", () => {
    const hostile = { orgId: ORG, slot: "brand_name", text: "Science\u200b Lab" };
    expect(admitTenantText(hostile, [hostile])).toMatchObject({ ok: false, reason: "control" });
    const link = { orgId: ORG, slot: "brand_name", text: "science.lab" };
    expect(admitTenantText(link, [link])).toMatchObject({ ok: false, reason: "link" });
  });
});

// The migration and pgTAP sync checks read files, so they live in apps/web/src/lib/tenant-text-sync.test.ts.
describe("the rule set", () => {
  // The #34 core's classes (packages/schema brand.ts plainName), derived from this Node's Unicode tables.
  const derive = (test: (s: string) => boolean) => {
    const out: [number, number][] = [];
    for (let cp = 0; cp <= 0x10ffff; cp++) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue;
      if (!test(String.fromCodePoint(cp))) continue;
      const last = out.at(-1);
      if (last && last[1] === cp - 1) last[1] = cp;
      else out.push([cp, cp]);
    }
    return out;
  };

  it("matches the #34 core's character and visibility classes exactly", () => {
    expect(TENANT_TEXT_RULES.chars).toEqual({
      trim: derive((s) => s.trim() === ""),
      refuse: derive((s) => /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(s)),
      blank: derive((s) => /[\p{Default_Ignorable_Code_Point}\u2800]/u.test(s)),
      visible: derive((s) => /[\p{L}\p{N}\p{P}\p{S}]/u.test(s)),
      marks: derive((s) => /\p{M}/u.test(s)),
    });
  });

  it("keeps the slot list in step with the TypeScript type", () => {
    expect(Object.keys(TENANT_TEXT_RULES.slots).sort()).toEqual(
      ["brand_name", "catalog_headline", "course_blurb", "catalog_tagline", "coach_name", "coach_role", "course_summary", "course_title", "welcome"].sort(),
    );
  });
});

// P4-A2 DTOs: the shapes the database returns (org_brand.test.sql) parse; anything wider is refused.
import { describe, expect, it } from "vitest";
import { orgBrandInputSchema, parseCourseCards, parseMemberBrandDto } from "./index";

const dto = {
  orgId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  revision: 4,
  name: "Andrew Fitness",
  nameAdmitted: true,
  brand: { mark: { kind: "text" }, colors: { accent: "#506e4b", onAccent: "#ffffff", band: "#0b3d2e" }, font: "geist" },
  texts: { headline: "Lift well for life" },
};
const card = {
  versionId: "c1000000-0000-4000-8000-000000000001",
  courseId: "a1000000-0000-4000-8000-000000000000",
  layer: "method",
  layerLabel: "Gym method",
  title: "Hinge basics",
  summary: "Hinge patterns for new lifters.",
  cover: { kind: "pattern", pattern: "dots", background: "#0b3d2e", foreground: "#ffffff" },
  tags: ["strength"],
  lessonCount: 1,
  durationMinutes: 7,
  publishedBySpindle: false,
  seal: false,
};

describe("MemberBrandDto", () => {
  it("parses the member read, with no brand yet or with one", () => {
    expect(parseMemberBrandDto(dto)).toEqual(dto);
    expect(parseMemberBrandDto({ ...dto, brand: null, name: "Your gym", nameAdmitted: false, texts: {} }).brand).toBeNull();
  });
  it.each([
    ["a logo mark", { brand: { ...dto.brand, mark: { kind: "logo" } } }],
    ["an unknown text", { texts: { review: "x" } }],
    ["a semantic colour", { brand: { ...dto.brand, colors: { ...dto.brand.colors, science: "#000000" } } }],
    ["an extra key", { progress: 1 }],
  ])("refuses %s", (_l, extra) => {
    expect(() => parseMemberBrandDto({ ...dto, ...extra })).toThrow();
  });
});

describe("orgBrandInputSchema", () => {
  it("refuses a name and a logo: the name is held text, logos wait for P4-A3", () => {
    expect(orgBrandInputSchema.safeParse({ ...dto.brand, name: "x" }).success).toBe(false);
    expect(orgBrandInputSchema.safeParse({ ...dto.brand, mark: { kind: "logo", key: "a.png" } }).success).toBe(false);
  });
});

describe("CourseCardDto", () => {
  it("parses a gym card and a base card", () => {
    expect(parseCourseCards([card])).toEqual([card]);
    const base = { ...card, layer: "base", layerLabel: "Base", cover: null, publishedBySpindle: true, seal: true, summary: null };
    expect(parseCourseCards([base])[0]!.seal).toBe(true);
  });
  it.each([
    ["a tenant cover on a base card", { layer: "base", layerLabel: "Base", publishedBySpindle: true, seal: true }],
    ["a wrong layer label", { layerLabel: "Base" }],
    ["a seal on a gym card", { seal: true }],
    ["an extra key", { progress: 0.5 }],
    ["a tag outside the taxonomy", { tags: ["unknown-tag"] }],
    ["a duplicate tag", { tags: ["strength", "strength"] }],
  ])("refuses %s", (_l, extra) => {
    expect(() => parseCourseCards([{ ...card, ...extra }])).toThrow();
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { memberBrand, memberCourseCards, memberVersionTexts } = await import("./tenant");

// Sol R1 on #45: an RPC error or a malformed response fails closed with a generic message: no
// database detail and no tenant text in the error, never an unbranded or partly branded page.
const ORG = { id: "00000000-0000-4000-8000-0000000000a1", name: "x", slug: "x" };
const ctx = (result: { data: unknown; error: unknown }) => ({ supabase: { rpc: vi.fn(async () => result) }, me: { id: "u" }, org: ORG }) as never;
const DB_ERROR = { message: 'permission denied for function member_brand: secret detail "Example Pilates Studio"', code: "42501" };

describe("member reads fail closed", () => {
  it.each([
    ["member_brand", (c: never) => memberBrand(c), "Could not load this gym's brand."],
    ["member_course_cards", (c: never) => memberCourseCards(c), "Could not load this gym's courses."],
    ["version_tenant_texts", (c: never) => memberVersionTexts(c, ORG.id), "Could not load this course's texts."],
  ] as const)("%s: an RPC error becomes a generic error with no database detail", async (_, read, message) => {
    const err = await read(ctx({ data: null, error: DB_ERROR })).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe(message);
    expect(String(err)).not.toMatch(/permission|42501|Example Pilates/);
  });

  it.each([
    ["member_brand", (c: never) => memberBrand(c), { orgId: ORG.id, name: "Example Pilates Studio", brand: { colors: "red" } }],
    ["member_course_cards", (c: never) => memberCourseCards(c), [{ title: "Example Pilates Studio" }]],
    ["version_tenant_texts", (c: never) => memberVersionTexts(c, ORG.id), [{ slot: "welcome", state: "maybe", text: "Example Pilates Studio" }]],
  ] as const)("%s: a malformed response is refused with a generic error and no tenant text", async (_, read, data) => {
    const err = await read(ctx({ data, error: null })).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(String(err)).not.toContain("Example Pilates Studio");
  });
});

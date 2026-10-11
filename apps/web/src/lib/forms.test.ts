import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
const { safeNext } = await import("./forms");

describe("safeNext", () => {
  it.each(["/gyms", "/gyms/gym-a", "/invite/abc?x=1"])("keeps same-site path %s", (path) => {
    expect(safeNext(path)).toBe(path);
  });

  it.each([
    "//evil.example",
    "/a/..//evil.example",
    "/a/../..//evil.example",
    "/%2e%2e//evil.example",
    "/\\evil.example",
    "/\\/evil.example",
    "https://evil.example",
    "/\tevil",
    "javascript:alert(1)",
    "",
    42,
    undefined,
  ])("rejects %s", (value) => {
    expect(safeNext(value)).toBe("/gyms");
  });
});

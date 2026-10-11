import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "./proxy";

// The brand preview is test-only: a production server without SPINDLE_PREVIEW_PAGES=1 must answer
// 404 for it however the path is spelled (Sol R1 on #34: encoded paths passed the gate).
describe("proxy: the test-only page gate in production", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ["the plain path", "/brand-preview", {}],
    ["a percent-encoded letter", "/%62rand-preview", {}],
    ["an encoded hyphen", "/brand%2dpreview", {}],
    ["an encoded hyphen in upper case", "/brand%2Dpreview", {}],
    ["a trailing slash", "/brand-preview/", {}],
    ["a doubled slash", "//brand-preview", {}],
    ["a dot segment", "/x/../brand-preview", {}],
    ["an RSC request", "/brand-preview", { RSC: "1" }],
    ["an RSC request with the cache-busting parameter", "/brand-preview?_rsc=abc", { RSC: "1" }],
    ["an encoded RSC request", "/%62rand%2dpreview", { RSC: "1" }],
  ] as const)("answers 404 for %s with the flag off", async (_, path, headers) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SPINDLE_PREVIEW_PAGES", "");
    const res = await proxy(new NextRequest(new URL(path, "http://127.0.0.1:3000"), { headers }));
    expect(res.status).toBe(404);
  });
});

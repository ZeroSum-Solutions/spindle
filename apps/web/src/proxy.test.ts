import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config, proxy } from "./proxy";

// A stand-in Supabase client: getClaims reports `sub` (and refreshes a cookie when asked), and the
// orgs read answers `org` or fails, like the RLS-protected read learnerGym() makes.
const supa = vi.hoisted(() => ({
  sub: null as string | null,
  org: null as { id: string } | null,
  fail: null as "error" | "throw" | null,
  refresh: false,
  slugs: [] as string[],
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: { setAll: (c: object[], h: object) => void } }) => ({
    auth: {
      getClaims: async () => {
        if (supa.refresh) options.cookies.setAll([{ name: "sb-test-auth-token", value: "refreshed", options: { path: "/" } }], {});
        return { data: supa.sub ? { claims: { sub: supa.sub } } : null, error: null };
      },
    },
    from: (table: string) => ({
      select: () => ({
        eq: (column: string, value: string) => ({
          maybeSingle: async () => {
            if (table !== "orgs" || column !== "slug") throw new Error(`unexpected read ${table}.${column}`);
            supa.slugs.push(value);
            if (supa.fail === "throw") throw new Error("network down");
            if (supa.fail === "error") return { data: null, error: { message: "boom" } };
            return { data: supa.org, error: null };
          },
        }),
      }),
    }),
  }),
}));

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
    const res = await proxy(new NextRequest(`http://127.0.0.1:3000${path}`, { headers }));
    expect(res.status).toBe(404);
  });

  it("passes the page through when the test server turns the flag on", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SPINDLE_PREVIEW_PAGES", "1");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:9");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    const res = await proxy(new NextRequest("http://127.0.0.1:3000/brand-preview"));
    expect(res.status).not.toBe(404);
  });
});

// Learner pages stream, so the page's own notFound() arrived with a 200. The proxy now answers a
// real 404 for anyone who cannot read the route gym (lead handoff 2026-10-11 follow-up).
describe("proxy: the learner membership gate", () => {
  const req = (path: string) => proxy(new NextRequest(`http://127.0.0.1:3000${path}`));

  afterEach(() => {
    Object.assign(supa, { sub: null, org: null, fail: null, refresh: false, slugs: [] });
  });

  it.each([
    ["the learner home", "/gyms/gym-b/learn"],
    ["an assignment", "/gyms/gym-b/learn/7d0f8c64-3f8e-4c1b-9f43-6b0c3f6b2a11"],
    ["a lesson", "/gyms/gym-b/learn/7d0f8c64-3f8e-4c1b-9f43-6b0c3f6b2a11/lesson-one"],
    ["the module quiz", "/gyms/gym-b/learn/7d0f8c64-3f8e-4c1b-9f43-6b0c3f6b2a11/module/quiz"],
    ["a percent-encoded letter", "/gyms/gym-b/%6cearn"],
    ["a double-encoded segment", "/gyms/gym-b/%256cearn"],
    ["upper case", "/Gyms/GYM-B/Learn"],
    ["a doubled slash", "/gyms//gym-b//learn/"],
    ["a dot segment", "/gyms/gym-a/../gym-b/./learn"],
    ["an RSC payload", "/gyms/gym-b/learn.rsc"],
  ])("answers 404 to a signed-in non-member on %s", async (_, path) => {
    supa.sub = "user-a";
    const res = await req(path);
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toBe("Not found");
    expect(supa.slugs).toEqual(["gym-b"]);
  });

  // Sol on #56: the router splits segments before decoding them, so `..%2f..` is one route
  // parameter (a [lesson]) that canonical decoding would resolve away, possibly onto another gym.
  it.each([
    ["an encoded slash and dot segments in the lesson", "/gyms/gym-b/learn/7d0f8c64-3f8e-4c1b-9f43-6b0c3f6b2a11/..%2f.."],
    ["dot segments that land on another gym", "/gyms/gym-a/learn/..%2f..%2f..%2fgym-b%2flearn"],
    ["a double-encoded slash", "/gyms/gym-b/learn/x/..%252f.."],
    ["an encoded backslash", "/gyms/gym-b/learn/x/..%5c.."],
    ["an encoded slash in the first segment", "/gyms%2fgym-b%2flearn"],
  ])("fails closed on %s, even for a member, without a read", async (_, path) => {
    Object.assign(supa, { sub: "user-b", org: { id: "org-b" } });
    const res = await req(path);
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(supa.slugs).toEqual([]);
  });

  // Argon on #56 (a1a17a2): exact inputs. Undecodable segments, and smuggling that pops the
  // canonical path off /gyms, must fail closed too. Next serves the lesson page for some of these
  // (`/%2e/gyms/...`, `..%252f..%25`) and answers 404 or 500 for the rest; the gate never passes them.
  const U = "7d0f8c64-3f8e-4c1b-9f43-6b0c3f6b2a11";
  const awkward = [
    `/gyms/gym-b/%6cearn/${U}/%FF`,
    `/%67yms/gym-b/learn/${U}/%FF`,
    `/gyms/gym-b/%256cearn/${U}/lesson%25`,
    `/gyms/gym%2db/learn/${U}/%FF`,
    "/gyms%2fgym-b%2flearn%2f..%2f..%2f..",
    "/gyms%2fgym-b/learn/x/..%2f..%2f..%2f..",
    "/%2e/gyms/gym-b/learn/x/..%2f..%2f..%2f..",
    "/gyms/gym-b/learn/x/..%2f..%FF",
    "/gyms/gym-b/learn/x/..%252f..%25",
  ];

  it.each(awkward)("fails closed on %s for a member, without a read", async (path) => {
    Object.assign(supa, { sub: "user-b", org: { id: "org-b" } });
    const res = await req(path);
    expect(res.status).toBe(404);
    expect(supa.slugs).toEqual([]);
  });

  it.each(awkward)("sends a signed-out visitor on %s to sign-in", async (path) => {
    const res = await req(path);
    expect(res.status).toBe(307);
  });

  it("reads each segment decoded on its own, as the router does", async () => {
    Object.assign(supa, { sub: "user-b", org: { id: "org-b" } });
    const res = await req(`/gyms/gym%2db/learn/${U}/lesson-one`);
    expect(res.status).toBe(200);
    expect(supa.slugs).toEqual(["gym-b"]);
  });

  it("sends a signed-out visitor on a smuggled learner path to sign-in", async () => {
    const res = await req("/gyms/gym-b/learn/x/..%2f..");
    expect(res.status).toBe(307);
  });

  it("keeps refreshed session cookies on the 404", async () => {
    Object.assign(supa, { sub: "user-a", refresh: true });
    const res = await req("/gyms/gym-b/learn");
    expect(res.status).toBe(404);
    expect(res.cookies.get("sb-test-auth-token")?.value).toBe("refreshed");
  });

  // Sol on #56 (a1a17a2): a failed lookup is not "not a member". It must not pass, and it must not
  // pose as a 404 either: a non-cacheable 503 with no detail in the body.
  it.each(["error", "throw"] as const)("answers 503 when the membership read reports %s", async (fail) => {
    Object.assign(supa, { sub: "user-a", org: { id: "org-b" }, fail, refresh: true });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await req("/gyms/gym-b/learn/x/lesson-one");
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toBe("Service unavailable");
    expect(res.cookies.get("sb-test-auth-token")?.value).toBe("refreshed");
    expect(logged).toHaveBeenCalledWith("learn gate: membership lookup failed", { reason: fail === "error" ? "query error" : "exception" });
    logged.mockRestore();
  });

  // Argon on #56 (a1a17a2): Server Actions answer in-band (NOT_SUBMITTED, NOT_SAVED); a proxy 404
  // would throw in the client and unmount the quiz. Actions repeat learnerGym() themselves, and an
  // unknown action id gets Next's own 400 without rendering the page.
  it("leaves a Server Action POST to the action's own checks", async () => {
    supa.sub = "user-a";
    const res = await proxy(new NextRequest("http://127.0.0.1:3000/gyms/gym-b/learn/x/module/quiz", { method: "POST", headers: { "Next-Action": "abc123" } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(supa.slugs).toEqual([]);
  });

  it.each([
    ["a GET that carries the action header", "GET", { "Next-Action": "abc123" }],
    ["a POST without the action header", "POST", {}],
  ] as const)("still gates %s", async (_, method, headers) => {
    supa.sub = "user-a";
    const res = await proxy(new NextRequest("http://127.0.0.1:3000/gyms/gym-b/learn/x/module/quiz", { method, headers }));
    expect(res.status).toBe(404);
    expect(supa.slugs).toEqual(["gym-b"]);
  });

  it("answers 404 without a read when the slug cannot be a gym", async () => {
    supa.sub = "user-a";
    const res = await req("/gyms/x/learn");
    expect(res.status).toBe(404);
    expect(supa.slugs).toEqual([]);
  });

  it("passes a member through", async () => {
    Object.assign(supa, { sub: "user-b", org: { id: "org-b" }, refresh: true });
    const res = await req("/gyms/gym-b/learn/7d0f8c64-3f8e-4c1b-9f43-6b0c3f6b2a11/lesson-one");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.cookies.get("sb-test-auth-token")?.value).toBe("refreshed");
    expect(supa.slugs).toEqual(["gym-b"]);
  });

  it.each(["/gyms/gym-b/learn", "/gyms/gym-b/%6cearn"])("sends a signed-out visitor on %s to sign-in", async (path) => {
    const res = await req(path);
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/sign-in");
    expect(supa.slugs).toEqual([]);
  });

  it("leaves other gym pages to the pages", async () => {
    supa.sub = "user-a";
    for (const path of ["/gyms", "/gyms/gym-b", "/gyms/gym-b/learners", "/gyms/gym-b/settings/learn"]) {
      expect((await req(path)).status).toBe(200);
    }
    expect(supa.slugs).toEqual([]);
  });
});

// Calling proxy() directly cannot show whether Next runs it at all. These go through Next's own
// matcher compiler (Sol on #56: an image extension on a lesson parameter skipped the proxy).
describe("proxy: the matcher", () => {
  const runs = (path: string) => unstable_doesMiddlewareMatch({ config, url: `http://127.0.0.1:3000${path}` });

  it.each([
    "/gyms/gym-b/learn",
    "/gyms/gym-b/learn/7d0f8c64-3f8e-4c1b-9f43-6b0c3f6b2a11/lesson-one",
    "/gyms/gym-b/learn/7d0f8c64-3f8e-4c1b-9f43-6b0c3f6b2a11/figure.png",
    "/gyms/gym-b/learn/7d0f8c64-3f8e-4c1b-9f43-6b0c3f6b2a11/figure.SVG",
    "/gyms/gym-b/learn/figure.webp",
    "/gyms/gym-b/learn/7d0f8c64-3f8e-4c1b-9f43-6b0c3f6b2a11/..%2f..",
    "/brand-preview",
  ])("runs on %s", (path) => {
    expect(runs(path)).toBe(true);
  });

  it.each(["/brand/icon-192.png", "/brand/spindle-symbol.svg", "/favicon.ico", "/_next/static/chunks/app.js", "/_next/image"])(
    "skips the static asset %s",
    (path) => {
      expect(runs(path)).toBe(false);
    },
  );
});

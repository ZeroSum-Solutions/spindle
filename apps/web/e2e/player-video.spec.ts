import { expect, test, type Page, type Request } from "@playwright/test";

// Click-to-load YouTube player (D-09), against the /design specimen. Production builds
// answer 404 at /design, so these cases run against a dev server only; they move to a
// real lesson once video blocks can be published. YouTube itself is stubbed: the
// tests prove what our page requests and renders, not YouTube's availability.

const ORIGIN_OK = (url: string, base: string) => {
  const u = new URL(url);
  return u.origin === new URL(base).origin || u.protocol === "data:" || u.protocol === "blob:";
};

async function openSpecimen(page: Page): Promise<Request[]> {
  const requests: Request[] = [];
  page.on("request", (r) => requests.push(r));
  const res = await page.goto("/design");
  test.skip(res?.status() === 404, "/design is development-only; the production build answers 404");
  await page.waitForLoadState("networkidle");
  return requests;
}

const segment = (page: Page, title: string) => page.locator('[data-block="video"]').filter({ hasText: title });

/** A stand-in IFrame API: a Player that reports ready, or an error, without any network. */
function stubApi(outcome: "ready" | "error" | "silent"): string {
  return `window.YT = { Player: function (frame, opts) {
    setTimeout(function () {
      if (${JSON.stringify(outcome)} === "ready") opts.events.onReady && opts.events.onReady();
      if (${JSON.stringify(outcome)} === "error") opts.events.onError && opts.events.onError({ data: 150 });
    }, 50);
  } };
  window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady();`;
}

async function stubYouTube(page: Page, outcome: "ready" | "error" | "silent" | "script-fails") {
  await page.route("https://www.youtube-nocookie.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>stub player</title>" }));
  await page.route("https://www.youtube.com/iframe_api", (route) =>
    outcome === "script-fails" ? route.abort() : route.fulfill({ contentType: "text/javascript", body: stubApi(outcome) }),
  );
}

test.describe("click-to-load YouTube player", () => {
  test("nothing third-party loads before the click, and the facade says where the video comes from", async ({ page, baseURL }) => {
    const requests = await openSpecimen(page);
    expect(requests.map((r) => r.url()).filter((u) => !ORIGIN_OK(u, baseURL!))).toEqual([]);
    expect(await page.locator("iframe").count()).toBe(0);
    expect(await page.locator('link[rel="preconnect"], link[rel="dns-prefetch"], link[rel="preload"]').evaluateAll((els) =>
      els.map((e) => e.getAttribute("href") ?? "").filter((h) => /youtube|ytimg|googlevideo/.test(h)),
    )).toEqual([]);
    expect(await page.locator("script[src]").evaluateAll((els) => els.map((e) => e.getAttribute("src")!).filter((s) => /youtube/.test(s)))).toEqual([]);

    const clip = segment(page, "Specimen clip: YouTube IFrame API demo");
    await expect(clip.getByText("Practice-based", { exact: true })).toBeVisible();
    await expect(clip).toContainText("You can complete this lesson without watching it.");
    await expect(clip.getByRole("link", { name: "privacy policy" })).toHaveAttribute("href", "https://policies.google.com/privacy");
    await expect(clip.getByRole("link", { name: "terms" })).toHaveAttribute("href", "https://www.youtube.com/t/terms");
    await expect(clip.locator("img")).toHaveCount(0);

    const csp = (await page.request.get("/design")).headers()["content-security-policy"] ?? "";
    expect(csp).toContain("frame-src https://www.youtube-nocookie.com;");
  });

  test("pressing play mounts the privacy-enhanced player in place of the facade", async ({ page }) => {
    await stubYouTube(page, "ready");
    await openSpecimen(page);
    const clip = segment(page, "Specimen clip: YouTube IFrame API demo");
    await clip.getByRole("button", { name: /Play video/ }).click();
    const frame = clip.locator('iframe[data-video="player"]');
    await expect(frame).toBeVisible();
    const src = new URL((await frame.getAttribute("src"))!);
    expect(src.origin).toBe("https://www.youtube-nocookie.com");
    expect(src.pathname).toBe("/embed/M7lc1UVf-VE");
    expect(src.searchParams.get("end")).toBe("30");
    expect(src.searchParams.has("controls")).toBe(false);
    await expect(frame).toHaveAttribute("referrerpolicy", "strict-origin");
    await expect(frame).toHaveAttribute("title", "YouTube video: Specimen clip: YouTube IFrame API demo");
    await expect(clip.locator('[data-video="facade"]')).toHaveCount(0);
    const box = (await frame.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(200);
    expect(box.height).toBeGreaterThanOrEqual(200);
    await expect(clip.getByText("Loading the YouTube player…")).toHaveCount(0);
    // The other clip on the page is untouched.
    await expect(segment(page, "video that cannot play").locator('[data-video="facade"]')).toBeVisible();
  });

  for (const outcome of ["error", "script-fails"] as const) {
    test(`a player ${outcome === "error" ? "error" : "script that fails to load"} ends in a truthful unavailable state`, async ({ page }) => {
      await stubYouTube(page, outcome);
      await openSpecimen(page);
      const clip = segment(page, "video that cannot play");
      await clip.getByRole("button", { name: /Play video/ }).click();
      const unavailable = clip.locator('[data-video="unavailable"]');
      await expect(unavailable).toContainText("This video is unavailable here right now.");
      await expect(unavailable.getByRole("link", { name: /Watch on YouTube/ })).toHaveAttribute("href", "https://www.youtube.com/watch?v=000000000aa&t=5s");
      await expect(clip.locator("iframe")).toHaveCount(0);
    });
  }
});

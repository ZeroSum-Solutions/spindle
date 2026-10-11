import { randomUUID } from "node:crypto";
import { expect, test, type Page, type Request } from "@playwright/test";
import { courseJson, PlayerWorld, practice, type Actor } from "./player-fixtures";
import { PracticeMedia } from "./helpers/practice-media";
import { learnPath, signIn } from "./helpers/sign-in";

// Click-to-load YouTube player (D-09, ADR 0007) in a real published lesson. Registry clips
// are synthetic fixtures admitted through the publisher RPCs; no real clip is published.
// YouTube itself is stubbed in the browser: these tests prove what our page requests and
// renders, not YouTube's availability.

const world = new PlayerWorld();
const media = new PracticeMedia(world);
let playableId: string;
const actors: Record<string, Actor> = {};
let gym: { id: string; slug: string };
let assignment: string;

const CLIP = { videoId: "abcDEF12_-9", startSeconds: 30, endSeconds: 95, rationale: "Synthetic rationale: shows the set-up." };
const OFF = { videoId: "zyxWVU98_-7", startSeconds: 0, endSeconds: 20, rationale: "Synthetic rationale: switched off after publishing." };
const LESSON = "clips";

const sameOrigin = (url: string, base: string) => {
  const u = new URL(url);
  return u.origin === new URL(base).origin || u.protocol === "data:" || u.protocol === "blob:";
};

/** A stand-in IFrame API: a Player that reports ready or an error, with no network. */
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

const clip = (page: Page, state: "playable" | "off") => page.locator(`[data-block="video"][data-clip="${state}"]`);

test.describe.serial("click-to-load registry clips", () => {
  test.beforeAll(async () => {
    test.setTimeout(180_000);
    world.publisher();
    for (const name of ["vowner", "vlearner"]) {
      const a = await world.actor(name);
      actors[name] = { email: a.email, id: a.id };
    }
    gym = world.gym("v", actors.vowner!);
    world.join(gym, actors.vowner!, actors.vlearner!);
    playableId = media.playable(CLIP, { title: "Synthetic clip title", channel: "Synthetic channel", available: true });
    const playable = playableId;
    const off = media.playable(OFF, { title: "Synthetic off clip", channel: "Synthetic channel", available: true });
    const version = world.publishGlobal(
      courseJson(randomUUID(), randomUUID(), "base", "Synthetic video course", [
        { id: randomUUID(), slug: LESSON, title: "Synthetic clips", blocks: [practice("Synthetic text."), media.block(playable, CLIP), media.block(off, OFF)] },
      ]),
    );
    // Disabling takes effect at once, without a new version.
    media.disable(off);
    assignment = world.assign(gym, actors.vowner!, version, actors.vlearner!);
  });

  test.afterAll(async () => {
    media.cleanup();
    await world.cleanup();
  });

  test("nothing third-party loads before the click; a switched-off clip offers nothing", async ({ browser, baseURL }) => {
    const path = learnPath(gym, assignment, LESSON);
    const page = await signIn(browser, actors.vlearner!, path);
    const requests: Request[] = [];
    page.on("request", (r) => requests.push(r));
    const res = await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Synthetic clips");
    expect(requests.map((r) => r.url()).filter((u) => !sameOrigin(u, baseURL!))).toEqual([]);
    expect(await page.locator("iframe").count()).toBe(0);
    expect(await page.locator("script[src]").evaluateAll((els) => els.map((e) => e.getAttribute("src")!).filter((s) => /youtube/.test(s)))).toEqual([]);
    expect(await page.locator('link[rel="preconnect"], link[rel="dns-prefetch"], link[rel="preload"]').evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? "").filter((h) => /youtube|ytimg|googlevideo/.test(h)))).toEqual([]);
    expect(res?.headers()["content-security-policy"] ?? "").toContain("frame-src https://www.youtube-nocookie.com;");

    const playable = clip(page, "playable");
    await expect(playable.getByText("Practice-based", { exact: true })).toBeVisible();
    await expect(playable.locator('[data-video="facade"]')).toContainText("Synthetic clip title");
    await expect(playable.locator('[data-video="facade"]')).toContainText("0:30 to 1:35");
    await expect(playable).toContainText("Synthetic rationale: shows the set-up.");
    await expect(playable).toContainText("You can complete this lesson without watching it.");
    await expect(playable.getByRole("link", { name: "privacy policy" })).toHaveAttribute("href", "https://policies.google.com/privacy");
    await expect(playable.getByRole("link", { name: "terms" })).toHaveAttribute("href", "https://www.youtube.com/t/terms");
    await expect(playable.locator("img")).toHaveCount(0);

    const off = clip(page, "off");
    await expect(off).toContainText("This video is switched off for now.");
    await expect(off.getByRole("button")).toHaveCount(0);
    await expect(off.locator("a")).toHaveCount(0);
    // Completion never depends on a video.
    await expect(page.getByRole("button", { name: "Mark lesson complete" })).toBeVisible();
  });

  test("pressing play mounts the privacy-enhanced player in place of the facade", async ({ browser }) => {
    const path = learnPath(gym, assignment, LESSON);
    const page = await signIn(browser, actors.vlearner!, path);
    await stubYouTube(page, "ready");
    await page.reload();
    const playable = clip(page, "playable");
    await playable.getByRole("button", { name: /Play video/ }).click();
    const frame = playable.locator('iframe[data-video="player"]');
    await expect(frame).toBeVisible();
    const src = new URL((await frame.getAttribute("src"))!);
    expect(src.origin).toBe("https://www.youtube-nocookie.com");
    expect(src.pathname).toBe(`/embed/${CLIP.videoId}`);
    expect([src.searchParams.get("start"), src.searchParams.get("end")]).toEqual(["30", "95"]);
    expect(src.searchParams.has("controls")).toBe(false);
    await expect(frame).toHaveAttribute("referrerpolicy", "strict-origin");
    await expect(frame).toHaveAttribute("title", "YouTube video: Synthetic clip title");
    await expect(playable.locator('[data-video="facade"]')).toHaveCount(0);
    const box = (await frame.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(200);
    expect(box.height).toBeGreaterThanOrEqual(200);
    await expect(playable.getByText("Loading the YouTube player…")).toHaveCount(0);
  });

  for (const outcome of ["error", "script-fails"] as const) {
    test(`a player ${outcome === "error" ? "error" : "script that fails to load"} ends in a truthful unavailable state`, async ({ browser }) => {
      const path = learnPath(gym, assignment, LESSON);
      const page = await signIn(browser, actors.vlearner!, path);
      await stubYouTube(page, outcome);
      await page.reload();
      const playable = clip(page, "playable");
      await playable.getByRole("button", { name: /Play video/ }).click();
      const unavailable = playable.locator('[data-video="unavailable"]');
      await expect(unavailable).toContainText("This video is unavailable here right now.");
      await expect(unavailable.getByRole("link", { name: /Watch on YouTube/ })).toHaveAttribute("href", `https://www.youtube.com/watch?v=${CLIP.videoId}&t=30s`);
      await expect(playable.locator("iframe")).toHaveCount(0);
    });
  }

  test("a player that never reports ready times out to unavailable, and the lesson completes without playing", async ({ browser }) => {
    test.setTimeout(90_000);
    const path = learnPath(gym, assignment, LESSON);
    const page = await signIn(browser, actors.vlearner!, path);
    await stubYouTube(page, "silent");
    await page.reload();
    const playable = clip(page, "playable");
    await playable.getByRole("button", { name: /Play video/ }).click();
    await expect(playable.locator('iframe[data-video="player"]')).toBeVisible();
    // READY_TIMEOUT_MS is 15 s.
    await expect(playable.locator('[data-video="unavailable"]')).toBeVisible({ timeout: 25_000 });
    await expect(playable.locator("iframe")).toHaveCount(0);

    // Completion never depends on a video: complete without playing, and it persists.
    const fresh = await signIn(browser, actors.vlearner!, path);
    await fresh.getByRole("button", { name: "Mark lesson complete" }).click();
    await expect(fresh.getByTestId("lesson-status")).toContainText("Saved.");
    await fresh.reload();
    await expect(fresh.getByTestId("lesson-status")).toContainText(/Completed\.|Lesson complete/);
  });

  test("the player keeps its minimum size on a 320px screen", async ({ browser }) => {
    const path = learnPath(gym, assignment, LESSON);
    const page = await signIn(browser, actors.vlearner!, path, { width: 320, height: 700 });
    await stubYouTube(page, "ready");
    await page.reload();
    const playable = clip(page, "playable");
    await playable.getByRole("button", { name: /Play video/ }).click();
    const box = (await playable.locator('iframe[data-video="player"]').boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(200);
    expect(box.height).toBeGreaterThanOrEqual(200);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  });

  // Last: it disables the playable clip for the rest of the run.
  test("a clip switched off after the page loaded does not play: play rechecks the registry first", async ({ browser }) => {
    const path = learnPath(gym, assignment, LESSON);
    const page = await signIn(browser, actors.vlearner!, path);
    const youtube: string[] = [];
    page.on("request", (r) => {
      if (/youtube|ytimg|googlevideo/.test(r.url())) youtube.push(r.url());
    });
    await expect(clip(page, "playable").getByRole("button", { name: /Play video/ })).toBeVisible();
    media.disable(playableId);
    await clip(page, "playable").getByRole("button", { name: /Play video/ }).click();
    await expect(clip(page, "playable").locator('[data-video="blocked"]')).toContainText("This video can't be played right now.");
    await expect(clip(page, "playable").locator("iframe")).toHaveCount(0);
    expect(youtube).toEqual([]);
  });
});

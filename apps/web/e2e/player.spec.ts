import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { carryForwardCredit } from "@spindle/engine";
import { codeAfter, courseJson, messageIds, PlayerWorld, practice, publicEnv, sql, type Actor, type LessonSpec } from "./player-fixtures";

// Learner flow against the real stack: Auth, RLS, the publish gate, assignment
// and completion RPCs, and Storage. Synthetic actors and content only.

const world = new PlayerWorld();
const actors: Record<string, Actor> = {};
let gymA: { id: string; slug: string };
let gymB: { id: string; slug: string };
let claimId: string;
let sourceId: string;
const ids = { course: randomUUID(), part: randomUUID(), method: randomUUID(), methodPart: randomUUID(), l: [randomUUID(), randomUUID(), randomUUID(), randomUUID()] };
const versions: Record<string, string> = {};
const assignments: Record<string, string> = {};
let storageUp = false;

const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

type CourseIds = { course: string; part: string; l: string[] };

function lessonOne(w: PlayerWorld = world, set: CourseIds = ids, claim: string = claimId): LessonSpec {
  return {
    id: set.l[0]!,
    slug: "lesson-one",
    title: "Synthetic lesson one",
    blocks: [
      { kind: "heading", content: "Synthetic heading" },
      { kind: "paragraph", content: "Synthetic science paragraph.", support: "science", claimIds: [claim] },
      practice("Synthetic practice paragraph."),
      { kind: "callout", content: { label: "Synthetic note", text: "Synthetic callout." }, support: "practice-based", claimIds: [] },
      { kind: "checklist", content: ["Synthetic step one", "Synthetic step two"], support: "practice-based", claimIds: [] },
      { kind: "image", content: { kind: "image", src: `/media/content/${w.run}/absent.png`, alt: "Synthetic absent figure", caption: "Synthetic caption", provenanceId: "synthetic" } },
      { kind: "diagram", content: { diagramId: "synthetic-diagram", alt: "Synthetic diagram", caption: "Synthetic diagram caption", legend: [] }, support: "practice-based", claimIds: [] },
      {
        kind: "quiz",
        content: { prompt: "Synthetic question?", options: ["Synthetic A", "Synthetic B"], answerIndex: 1, explanation: "Synthetic explanation." },
        support: "science",
        claimIds: [claim],
      },
      {
        kind: "quiz",
        content: { prompt: "Synthetic practice question?", options: ["Synthetic P1", "Synthetic P2"], answerIndex: 1, explanation: "Synthetic practice explanation." },
        support: "practice-based",
        claimIds: [],
      },
    ],
    resources: [{ label: "Synthetic reference", href: "https://example.org/synthetic", type: "reference" }],
  };
}
const lessonFor = (set: CourseIds) => (i: number, title: string, text = `Synthetic text ${i}.`): LessonSpec => ({ id: set.l[i]!, slug: `lesson-${i + 1}`, title, blocks: [practice(text)] });

/** v1 to v3 of one synthetic base course. v2: lesson one unchanged, two edited, three removed, four added. v3: lesson one still unchanged. */
function courseVersions(w: PlayerWorld, set: CourseIds, claim: string, title: string) {
  const lesson = lessonFor(set);
  const one = () => lessonOne(w, set, claim);
  return {
    v1: () => courseJson(set.course, set.part, "base", title, [one(), lesson(1, "Synthetic lesson two"), lesson(2, "Synthetic lesson three")]),
    v2: () => courseJson(set.course, set.part, "base", title, [one(), lesson(1, "Synthetic lesson two", "Synthetic text, revised."), lesson(3, "Synthetic lesson four")]),
    v3: () => courseJson(set.course, set.part, "base", title, [one(), lesson(3, "Synthetic lesson four")]),
  };
}
const v1 = () => courseVersions(world, ids, claimId, "Synthetic base course").v1();
const v2 = () => courseVersions(world, ids, claimId, "Synthetic base course").v2();
const v3 = () => courseVersions(world, ids, claimId, "Synthetic base course").v3();

async function signIn(browser: Browser, who: Actor, next: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  const before = await messageIds(who.email);
  await page.getByLabel("Email").fill(who.email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel("6-digit code").fill(await codeAfter(who.email, before));
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`**${next}`);
  await new Promise((r) => setTimeout(r, 1100)); // one code per address per second
  return page;
}

const learn = (gym: { slug: string }, assignment?: string, lessonSlug?: string) =>
  `/gyms/${gym.slug}/learn${assignment ? `/${assignment}` : ""}${lessonSlug ? `/${lessonSlug}` : ""}`;

/** Where a horizontal span of the layout sits: the left edge of one element to the right edge of another. Null if either is missing. */
async function layoutSpan(page: Page, leftSelector: string, rightSelector: string) {
  return page.evaluate(([l, r]) => {
    const a = document.querySelector(l)?.getBoundingClientRect();
    const b = document.querySelector(r)?.getBoundingClientRect();
    if (!a || !b) return null;
    const viewport = document.documentElement.clientWidth;
    return { left: Math.round(a.left), right: Math.round(b.right), width: Math.round(b.right - a.left), offset: Math.round((a.left + b.right) / 2 - viewport / 2) };
  }, [leftSelector, rightSelector] as const);
}

const COLUMN = 'main [data-layout="column"]';
const OUTLINE = 'main [data-layout="reading"] > :first-child';
const ARTICLE = 'main article[aria-labelledby="lesson-title"]';

async function expectNotFound(page: Page, path: string) {
  // Pages stream, so the status is sent before notFound(); assert content instead.
  await page.goto(path);
  await expect(page.getByText(/could not be found/i)).toBeVisible();
}

test.describe.serial("learner flow", () => {
  test.beforeAll(async () => {
    test.setTimeout(180_000);
    world.publisher();
    for (const name of ["owner", "partial", "full", "multi", "ownerb"]) {
      const a = await world.actor(name);
      actors[name] = { email: a.email, id: a.id };
      if (name === "owner") {
        // Storage is optional on the lean stack; the media cases say so when it is off.
        const { url } = publicEnv();
        storageUp = (await fetch(`${url}/storage/v1/version`).catch(() => null))?.ok ?? false;
        gymA = world.gym("a", actors.owner!);
        if (storageUp) {
          const name = `${gymA.id}/${world.run}/figure.png`;
          const { error } = await a.client.storage.from("org-media").upload(name, PNG_1PX, { contentType: "image/png" });
          if (error) throw new Error(`upload failed: ${error.message}`);
          world.uploads.push({ client: a.client, bucket: "org-media", name });
          // Synthetic bytes labelled video/mp4: enough to prove signing, redirect and ranges.
          const clip = `${gymA.id}/${world.run}/clip-mp4`;
          const { error: videoError } = await a.client.storage.from("org-media").upload(clip, Buffer.alloc(4096, 7), { contentType: "video/mp4" });
          if (videoError) throw new Error(`video upload failed: ${videoError.message}`);
          world.uploads.push({ client: a.client, bucket: "org-media", name: clip });
        }
      }
    }
    gymB = world.gym("b", actors.ownerb!);
    for (const m of ["partial", "full", "multi"]) world.join(gymA, actors.owner!, actors[m]!);
    world.join(gymB, actors.ownerb!, actors.multi!);
    [claimId, sourceId] = world.claim();
    versions.v1 = world.publishGlobal(v1());
    versions.method = world.publishMethod(gymA, actors.owner!, courseJson(ids.method, ids.methodPart, "method", "Synthetic gym method", [
      {
        id: randomUUID(),
        slug: "house-cues",
        title: "Synthetic house cues",
        blocks: [practice("Synthetic house cue.")],
        media: [
          { kind: "image", src: `/media/org/${gymA.id}/${world.run}/figure.png`, alt: "Synthetic gym figure", caption: "", provenanceId: "synthetic" },
        ],
      },
    ]));
    assignments.partial = world.assign(gymA, actors.owner!, versions.v1, actors.partial!);
    assignments.full = world.assign(gymA, actors.owner!, versions.v1, actors.full!);
    assignments.multiA = world.assign(gymA, actors.owner!, versions.v1, actors.multi!);
    assignments.multiB = world.assign(gymB, actors.ownerb!, versions.v1, actors.multi!);
    assignments.method = world.assign(gymA, actors.owner!, versions.method, actors.partial!);
  });

  test.afterAll(async () => {
    await world.cleanup();
  });

  test("signed-out visitors are sent to sign-in, and media refuses them", async ({ browser }) => {
    const anon = await (await browser.newContext()).newPage();
    await anon.goto(learn(gymA));
    await expect(anon).toHaveURL(/\/sign-in\?next=/);
    const res = await anon.request.get(`/media/org/${gymA.id}/${world.run}/figure.png`);
    expect(res.status()).toBe(404);
    expect(res.headers()["cache-control"]).toContain("no-store");
  });

  test("assigned list shows only my courses in this gym", async ({ browser }) => {
    const p = await signIn(browser, actors.partial!, learn(gymA));
    await expect(p.getByRole("heading", { name: "Your courses" })).toBeVisible();
    const rows = p.getByTestId("course-row");
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: "Synthetic base course" })).toContainText("Base");
    await expect(rows.filter({ hasText: "Synthetic gym method" })).toContainText("Gym method");
    await expect(p.getByRole("link", { name: /Resume lesson/ })).toBeVisible();
    // The owner has no assignment of their own: honest empty state, not others' rows.
    const o = await signIn(browser, actors.owner!, learn(gymA));
    await expect(o.getByText("Nothing is assigned to you in this gym yet.")).toBeVisible();
  });

  test("player renders every block kind with support labels, sources and safe media", async ({ browser }) => {
    const p = await signIn(browser, actors.partial!, learn(gymA, assignments.partial, "lesson-one"));
    await expect(p.getByRole("heading", { level: 1, name: "Synthetic lesson one" })).toBeVisible();
    await expect(p.getByRole("heading", { level: 2, name: "Synthetic heading" })).toBeVisible();
    const science = p.locator('[data-block="paragraph"][data-support="science"]');
    await expect(science.getByText("Science", { exact: true })).toBeVisible();
    await science.locator("summary", { hasText: "Show sources" }).click();
    await expect(science.getByText(`Synthetic claim ${world.run}.`)).toBeVisible();
    const doi = science.getByRole("link", { name: new RegExp(world.doi.replace(/\./g, "\\.")) });
    await expect(doi).toHaveAttribute("href", `https://doi.org/${world.doi}`);
    await expect(doi).toHaveAttribute("rel", "noopener noreferrer");
    await expect(p.locator('[data-block="paragraph"][data-support="practice-based"]').getByText("Practice-based", { exact: true })).toBeVisible();
    // Back-to-back practice blocks (paragraph, callout, checklist) share one label; each keeps its support in data.
    // The practice question near the end follows the science question, so it starts a new run with its own label.
    await expect(p.locator('[data-block="callout"]').getByText("Practice-based", { exact: true })).toHaveCount(0);
    await expect(p.locator('[data-block="checklist"]').getByText("Practice-based", { exact: true })).toHaveCount(0);
    await expect(p.locator('[data-block="quiz"][data-support="practice-based"]').getByText("Practice-based", { exact: true })).toHaveCount(1);
    await expect(p.locator("article section[data-support]").getByText("Practice-based", { exact: true })).toHaveCount(2);
    await expect(p.locator('article section[data-support="practice-based"]')).toHaveCount(4);
    await expect(p.locator('[data-block="callout"]')).toContainText("Synthetic callout.");
    await expect(p.locator('[data-block="checklist"] li')).toHaveCount(2);
    await expect(p.locator('[data-block="diagram"]')).toContainText("This diagram is not available yet.");
    // A storage object that does not exist: honest placeholder, no broken image.
    await expect(p.locator('[data-block="image"] [data-media="unavailable"]')).toContainText("Synthetic absent figure");
    // A graded (science) question shows its prompt and points to the module quiz; the lesson never reveals its answer.
    const graded = p.locator('[data-block="quiz"][data-support="science"]');
    await expect(graded).toContainText("Synthetic question?");
    await expect(graded.getByRole("link", { name: "Go to the module quiz" })).toHaveAttribute("href", learn(gymA, assignments.partial, "module/quiz"));
    await expect(graded.getByRole("button", { name: "Check answer" })).toHaveCount(0);
    await expect(graded).not.toContainText("Synthetic explanation.");
    // A practice question stays an ungraded self-check: feedback after checking, and it says nothing is saved.
    const quiz = p.locator('[data-block="quiz"][data-support="practice-based"]');
    await quiz.getByLabel("Synthetic P1").check();
    await quiz.getByRole("button", { name: "Check answer" }).click();
    await expect(quiz).toContainText("Not quite. The answer is: Synthetic P2");
    await expect(quiz).toContainText("not saved or graded");
    const external = p.getByRole("link", { name: /Synthetic reference/ });
    await expect(external).toHaveAttribute("rel", "noopener noreferrer");
    const hrefs = await p.locator("a[href], img[src], video source[src]").evaluateAll((els) =>
      els.map((e) => e.getAttribute("href") ?? e.getAttribute("src") ?? ""),
    );
    expect(hrefs.filter((h) => /^(javascript|data):/i.test(h))).toEqual([]);
    // The player reflows at 320px without sideways scrolling.
    await p.setViewportSize({ width: 320, height: 700 });
    for (const path of [learn(gymA), learn(gymA, assignments.partial), learn(gymA, assignments.partial, "lesson-one")]) {
      await p.goto(path);
      await expect(p.getByRole("main")).toBeVisible();
      expect(await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), path).toBe(0);
    }
    // Long identifiers in open sources wrap instead of widening the page.
    await p.locator('[data-block="paragraph"][data-support="science"] summary').click();
    await expect(p.getByRole("link", { name: /DOI 10\.5555/ })).toBeVisible();
    expect(await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), "sources open at 320px").toBe(0);
  });

  test("learner pages centre their column on wide screens", async ({ browser }) => {
    const p = await signIn(browser, actors.partial!, learn(gymA));
    const pages = [
      { path: learn(gymA), heading: "Your courses", span: [COLUMN, COLUMN], max: 768 },
      { path: learn(gymA, assignments.partial), heading: "Synthetic base course", span: [COLUMN, COLUMN], max: 768 },
      // The player: the outline's left edge to the article's right edge, centred as one group.
      { path: learn(gymA, assignments.partial, "lesson-one"), heading: "Synthetic lesson one", span: [OUTLINE, ARTICLE], max: 1008 },
    ] as const;
    for (const width of [1440, 1280, 1024]) {
      await p.setViewportSize({ width, height: 900 });
      for (const { path, heading, span, max } of pages) {
        await p.goto(path);
        await expect(p.getByRole("heading", { level: 1 })).toHaveText(heading);
        const at = await layoutSpan(p, span[0], span[1]);
        expect(at, `${path} at ${width}px: layout elements missing`).not.toBeNull();
        expect(Math.abs(at!.offset), `${path} at ${width}px: ${at!.offset}px off centre (left ${at!.left}, right ${at!.right})`).toBeLessThanOrEqual(2);
        // The column fills its frame, so a narrower inner element cannot hide inside a centred wrapper.
        expect(Math.abs(at!.width - Math.min(max, width - 64)), `${path} at ${width}px: width ${at!.width}`).toBeLessThanOrEqual(2);
      }
    }
    // Negative cases: the measurement must notice displaced inner content.
    await p.setViewportSize({ width: 1440, height: 900 });
    await p.goto(learn(gymA));
    await expect(p.getByRole("heading", { level: 1 })).toHaveText("Your courses");
    await p.locator(COLUMN).evaluate((el: HTMLElement) => (el.style.transform = "translateX(112px)"));
    expect((await layoutSpan(p, COLUMN, COLUMN))!.offset).toBeGreaterThanOrEqual(100);
    await p.goto(learn(gymA, assignments.partial, "lesson-one"));
    await expect(p.getByRole("heading", { level: 1 })).toHaveText("Synthetic lesson one");
    await p.locator(ARTICLE).evaluate((el: HTMLElement) => (el.style.transform = "translateX(-112px)"));
    expect((await layoutSpan(p, OUTLINE, ARTICLE))!.offset).toBeLessThanOrEqual(-50);
  });

  test("the header lines up with the content and survives a long gym name", async ({ browser }) => {
    const p = await signIn(browser, actors.partial!, learn(gymA));
    await p.setViewportSize({ width: 1440, height: 900 });
    for (const [path, left] of [[learn(gymA), COLUMN], [learn(gymA, assignments.partial, "lesson-one"), OUTLINE]] as const) {
      await p.goto(path);
      await expect(p.getByRole("heading", { level: 1 })).toBeVisible();
      const mark = (await p.locator("header img").first().boundingBox())!;
      const content = (await layoutSpan(p, left, left))!;
      expect(Math.abs(mark.x - content.left), `${path}: wordmark at ${mark.x}, content at ${content.left}`).toBeLessThanOrEqual(1);
    }
    // A gym name far longer than the header: it truncates beside the wordmark, never under it.
    await p.setViewportSize({ width: 320, height: 700 });
    await p.goto(learn(gymA));
    await expect(p.getByRole("heading", { level: 1 })).toHaveText("Your courses");
    await p.locator("[data-header-context]").evaluate((el) => (el.textContent = "A synthetic gym name that is much too long for any phone header at all"));
    const mark = (await p.locator("header img").first().boundingBox())!;
    const name = (await p.locator("[data-header-context]").boundingBox())!;
    expect(mark.width).toBe(120);
    expect(name.x, "gym name overlaps the wordmark").toBeGreaterThanOrEqual(mark.x + mark.width + 8);
    expect(name.x + name.width).toBeLessThanOrEqual(320 - 16 + 1);
    expect(await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  });

  test("on phones, next lesson is the one full-width way forward; previous is a small link", async ({ browser }) => {
    const p = await signIn(browser, actors.partial!, learn(gymA, assignments.partial, "lesson-2"));
    for (const width of [390, 320]) {
      await p.setViewportSize({ width, height: 800 });
      await p.goto(learn(gymA, assignments.partial, "lesson-2"));
      await expect(p.getByRole("heading", { level: 1 })).toHaveText("Synthetic lesson two");
      const nav = p.getByRole("navigation", { name: "Lesson navigation" });
      const next = nav.getByRole("link", { name: /Next lesson/ });
      const prev = nav.getByRole("link", { name: /Previous lesson/ });
      const [navBox, nextBox, prevBox] = [(await nav.boundingBox())!, (await next.boundingBox())!, (await prev.boundingBox())!];
      expect(Math.abs(nextBox.width - navBox.width), "next is full width").toBeLessThanOrEqual(1);
      expect(nextBox.height).toBeGreaterThanOrEqual(48);
      expect(prevBox.y + prevBox.height, "previous sits above next").toBeLessThanOrEqual(nextBox.y);
      expect(prevBox.height).toBeGreaterThanOrEqual(44);
      const size = (l: typeof next) => l.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(await size(prev)).toBeLessThan(await size(next.locator("[data-next-title]")));
    }
  });

  test("method course is practice-based only and serves its gym's media to members", async ({ browser }) => {
    const p = await signIn(browser, actors.partial!, learn(gymA, assignments.method, "house-cues"));
    await expect(p.getByText("Gym method").first()).toBeVisible();
    await expect(p.getByText("Science", { exact: true })).toHaveCount(0);
    await expect(p.locator('[data-support="science"]')).toHaveCount(0);
    // CI must exercise this path: a stack without Storage is an environment failure there, never a silent skip.
    if (process.env.CI) expect(storageUp, "Storage API is not reachable; CI must run the media case").toBe(true);
    test.skip(!storageUp, "Storage API is not running on this stack; media positive path not exercised");
    const img = p.getByRole("img", { name: "Synthetic gym figure" });
    await expect(img).toHaveAttribute("referrerpolicy", "no-referrer");
    await expect.poll(() => img.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth)).toBe(1);
    const res = await p.request.get(`/media/org/${gymA.id}/${world.run}/figure.png`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
    expect(res.headers()["cache-control"]).toBe("private, no-store");
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
    // A member of gym B only cannot read gym A's media, and the answer is the same 404.
    const b = await signIn(browser, actors.ownerb!, learn(gymB));
    expect((await b.request.get(`/media/org/${gymA.id}/${world.run}/figure.png`)).status()).toBe(404);
    expect((await b.request.get(`/media/org/${gymA.id}/${world.run}/missing.png`)).status()).toBe(404);
    expect((await b.request.get(`/media/content/..%2F${world.run}/figure.png`)).status()).toBe(404);

    // Stored video bytes: lessons cannot embed a plain video (registry-only, Sol R1 PR23-01), but the
    // media route still serves a gym's stored file: the member gets a redirect to a signed Storage URL
    // that lives at most 60 s and serves byte ranges; another gym's member gets the same 404.
    const clip = `/media/org/${gymA.id}/${world.run}/clip-mp4`;
    const redirect = await p.request.get(clip, { maxRedirects: 0 });
    expect(redirect.status()).toBe(302);
    expect(redirect.headers()["cache-control"]).toBe("private, no-store");
    const location = new URL(redirect.headers()["location"]!);
    expect(location.pathname).toContain(`/storage/v1/object/sign/org-media/${gymA.id}/${world.run}/clip-mp4`);
    const token = location.searchParams.get("token")!;
    const claims = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString()) as { iat: number; exp: number };
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(60);
    const range = await fetch(location, { headers: { Range: "bytes=0-99" } });
    expect(range.status).toBe(206);
    expect(range.headers.get("content-type")).toBe("video/mp4");
    expect((await range.arrayBuffer()).byteLength).toBe(100);
    const foreign = await b.request.get(clip, { maxRedirects: 0 });
    expect(foreign.status()).toBe(404);
    expect(foreign.headers()["location"]).toBeUndefined();
  });

  test("progress persists across reload and a fresh session; duplicate completion counts once", async ({ browser }) => {
    const path = learn(gymA, assignments.partial, "lesson-one");
    const p = await signIn(browser, actors.partial!, path);
    // Two tabs open the lesson before anything is saved, then both submit.
    const second = await p.context().newPage();
    await second.goto(path);
    await expect(p.getByRole("button", { name: "Mark lesson complete" })).toBeVisible();
    await expect(second.getByRole("button", { name: "Mark lesson complete" })).toBeVisible();
    const rows = () =>
      sql(`select count(*) || '|' || min(completed_at)::text from public.lesson_completions where user_id = '${actors.partial!.id}' and lesson_id = '${ids.l[0]}' and version_id = '${versions.v1}'`);
    await p.getByRole("button", { name: "Mark lesson complete" }).dblclick();
    await expect(p.getByTestId("lesson-status")).toContainText("Saved.");
    await expect(p.getByTestId("lesson-status")).toContainText("v1");
    const first = rows();
    expect(first.startsWith("1|")).toBe(true);
    await second.getByRole("button", { name: "Mark lesson complete" }).click();
    await expect(second.getByTestId("lesson-status")).toContainText("Saved.");
    expect(rows()).toBe(first); // still one row, and its completed_at did not move
    await p.reload();
    await expect(p.getByTestId("lesson-status")).toContainText("Lesson complete · v1");
    await expect(p.getByTestId("lesson-status")).not.toContainText("Completed");
    // The confirmation holds the one primary way forward.
    await expect(p.getByTestId("lesson-status").getByRole("link", { name: /Next: Synthetic lesson two/ })).toHaveAttribute("href", learn(gymA, assignments.partial, "lesson-2"));
    await p.goto(learn(gymA, assignments.partial));
    await expect(p.getByText("1 of 3 lessons done", { exact: true })).toBeVisible();
    const fresh = await signIn(browser, actors.partial!, learn(gymA, assignments.partial));
    await expect(fresh.getByText("1 of 3 lessons done", { exact: true })).toBeVisible();
    expect(rows()).toBe(first);
  });

  test("the full learner completes v1", async ({ browser }) => {
    const f = await signIn(browser, actors.full!, learn(gymA, assignments.full, "lesson-one"));
    for (const slug of ["lesson-one", "lesson-2", "lesson-3"]) {
      await f.goto(learn(gymA, assignments.full, slug));
      await f.getByRole("button", { name: "Mark lesson complete" }).click();
      await expect(f.getByTestId("lesson-status")).toContainText("Saved.");
    }
    await f.goto(learn(gymA, assignments.full));
    await expect(f.getByText("You completed every lesson in v1.")).toBeVisible();
  });

  test("v2 carries unchanged credit, reopens changed lessons, retires removed ones", async ({ browser }) => {
    versions.v2 = world.publishGlobal(v2());
    assignments.partial2 = world.assign(gymA, actors.owner!, versions.v2, actors.partial!);
    assignments.full2 = world.assign(gymA, actors.owner!, versions.v2, actors.full!);

    // The list leads with v2; v1 stays reachable; Resume points into v2, never into a removed lesson.
    const list = await signIn(browser, actors.partial!, learn(gymA));
    await expect(list.getByTestId("course-row")).toHaveCount(2);
    await expect(list.getByRole("link", { name: /^v1 · 1 of 3 done$/ })).toHaveAttribute("href", learn(gymA, assignments.partial));
    // At 320px the label sits above the version links, 8px apart and left-aligned; a link never wraps.
    await list.setViewportSize({ width: 320, height: 700 });
    const label = await list.getByText("Earlier versions", { exact: true }).boundingBox();
    const v1 = list.getByRole("link", { name: /^v1 · 1 of 3 done$/ });
    const link = await v1.boundingBox();
    expect(link!.y - (label!.y + label!.height), "gap between label and links").toBeGreaterThanOrEqual(4);
    expect(link!.y - (label!.y + label!.height), "gap between label and links").toBeLessThanOrEqual(12);
    expect(Math.abs(link!.x - label!.x)).toBeLessThanOrEqual(1);
    expect(await v1.evaluate((el) => { const r = document.createRange(); r.selectNodeContents(el); return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size; })).toBe(1);
    await list.setViewportSize({ width: 1280, height: 800 });
    await expect(list.getByRole("link", { name: /Resume lesson/ })).toHaveAttribute("href", learn(gymA, assignments.partial2, "lesson-2"));

    const p = await signIn(browser, actors.partial!, learn(gymA, assignments.partial2));
    const lessonRow = (page: Page, title: string) => page.getByRole("listitem").filter({ has: page.getByText(title, { exact: true }) });
    await expect(lessonRow(p, "Synthetic lesson one")).toContainText("Credited");
    await expect(lessonRow(p, "Synthetic lesson one")).toContainText("in v1");
    await expect(lessonRow(p, "Synthetic lesson two")).toContainText("To do");
    await expect(lessonRow(p, "Synthetic lesson four")).toContainText("New");
    const changes = p.getByRole("region", { name: "What changed from v1 to v2" });
    await expect(changes).toContainText("Synthetic lesson two");
    await expect(changes).toContainText("Synthetic lesson four");
    await expect(changes).toContainText("Synthetic lesson three");

    const f = await signIn(browser, actors.full!, learn(gymA, assignments.full2));
    await expect(lessonRow(f, "Synthetic lesson one")).toContainText("Credited");
    await expect(lessonRow(f, "Synthetic lesson two")).toContainText("Updated");
    await expect(lessonRow(f, "Synthetic lesson four")).toContainText("New");
    await expect(f.getByText("1 of 3 lessons done", { exact: true })).toBeVisible();
    await f.goto(learn(gymA, assignments.full));
    await expect(f.getByText("You completed every lesson in v1.")).toBeVisible();

    // The database's carried rows equal the engine's carry-forward for both learners.
    for (const who of ["partial", "full"] as const) {
      const rows = world.completions(actors[who]!, gymA);
      const toCompletion = (r: (typeof rows)[number]) => ({ id: r.id, lessonId: r.lesson_id, versionId: r.version_id, contentHash: r.content_hash, completedAt: r.completed_at, originCompletionId: r.origin_completion_id });
      const engine = carryForwardCredit(world.manifest(versions.v1!), world.manifest(versions.v2!), rows.filter((r) => r.version_id === versions.v1).map(toCompletion));
      const carried = rows.filter((r) => r.version_id === versions.v2).map((r) => ({ lessonId: r.lesson_id, versionId: r.version_id, contentHash: r.content_hash, originCompletionId: r.origin_completion_id }));
      expect(carried).toEqual(engine.carried);
    }
  });

  test("v3 credit keeps the original v1 completion as its root", async ({ browser }) => {
    versions.v3 = world.publishGlobal(v3());
    assignments.partial3 = world.assign(gymA, actors.owner!, versions.v3, actors.partial!);
    const root = sql(`select id from public.lesson_completions where user_id = '${actors.partial!.id}' and version_id = '${versions.v1}' and lesson_id = '${ids.l[0]}'`);
    const origin = sql(`select origin_completion_id from public.lesson_completions where user_id = '${actors.partial!.id}' and version_id = '${versions.v3}' and lesson_id = '${ids.l[0]}'`);
    expect(origin).toBe(root);
    const p = await signIn(browser, actors.partial!, learn(gymA, assignments.partial3, "lesson-one"));
    await expect(p.getByTestId("lesson-status")).toContainText("Credited · v3");
    await expect(p.getByTestId("lesson-status")).toContainText("in v1");
    await p.reload();
    await expect(p.getByTestId("lesson-status")).toContainText("in v1");
  });

  test("a late v1 completion reaches v2 only when the lesson is unchanged", async ({ browser }) => {
    const m = await signIn(browser, actors.multi!, learn(gymA, assignments.multiA, "lesson-2"));
    assignments.multi2 = world.assign(gymA, actors.owner!, versions.v2!, actors.multi!);
    await m.reload();
    await m.getByRole("button", { name: "Mark lesson complete" }).click();
    await expect(m.getByTestId("lesson-status")).toContainText("Saved.");
    await m.goto(learn(gymA, assignments.multiA, "lesson-one"));
    await m.getByRole("button", { name: "Mark lesson complete" }).click();
    await expect(m.getByTestId("lesson-status")).toContainText("Saved.");
    await m.goto(learn(gymA, assignments.multi2));
    const row = (title: string) => m.getByRole("listitem").filter({ has: m.getByText(title, { exact: true }) });
    await expect(row("Synthetic lesson one")).toContainText("Credited");
    await expect(row("Synthetic lesson two")).toContainText("Updated");
  });

  test("two gyms stay separate, and assignments are self-only", async ({ browser }) => {
    const m = await signIn(browser, actors.multi!, learn(gymB, assignments.multiB));
    await expect(m.getByText("0 of 3 lessons done", { exact: true })).toBeVisible();
    await expectNotFound(m, learn(gymB, assignments.multiA));
    await expectNotFound(m, learn(gymB, assignments.method));
    const b = await signIn(browser, actors.ownerb!, learn(gymB));
    await expectNotFound(b, learn(gymA, assignments.method));
    await expectNotFound(b, learn(gymA));
    const o = await signIn(browser, actors.owner!, learn(gymA));
    await expectNotFound(o, learn(gymA, assignments.partial));
    await expectNotFound(o, learn(gymA, assignments.partial, "lesson-one"));
  });

  test("unknown lessons and malformed ids are not found", async ({ browser }) => {
    const p = await signIn(browser, actors.partial!, learn(gymA));
    await expectNotFound(p, learn(gymA, assignments.partial, "no-such-lesson"));
    await expectNotFound(p, learn(gymA, "not-a-uuid"));
  });

  test("a retraction flags the version, keeps credit and still allows completion", async ({ browser }) => {
    world.retract(sourceId);
    const p = await signIn(browser, actors.partial!, learn(gymA, assignments.partial));
    await expect(p.getByText("A source cited in this version was retracted after it was published")).toBeVisible();
    await expect(p.getByText("1 of 3 lessons done", { exact: true })).toBeVisible();
    await p.goto(learn(gymA, assignments.partial, "lesson-one"));
    await expect(p.locator('[data-block="paragraph"][data-support="science"]').getByText("Source retracted")).toBeVisible();
    await p.goto(learn(gymA, assignments.partial, "lesson-2"));
    await p.getByRole("button", { name: "Mark lesson complete" }).click();
    await expect(p.getByTestId("lesson-status")).toContainText("Saved.");
  });

  test("captures rendered learner states for design review", async ({ browser }) => {
    const dir = process.env.PLAYER_CAPTURE_DIR;
    test.skip(!dir, "set PLAYER_CAPTURE_DIR to capture design evidence");
    test.setTimeout(300_000);
    // A world of its own: actors, gym, claim and source, three versions, a carried credit and a
    // retraction. The shots show the same state whether this runs alone (-g) or after the suite.
    const cap = new PlayerWorld();
    try {
      cap.publisher();
      const owner = await cap.actor("cap-owner");
      const learner = await cap.actor("cap-learner");
      const gym = cap.gym("cap", owner);
      cap.join(gym, owner, learner);
      const [capClaim, capSource] = cap.claim();
      const set: CourseIds = { course: randomUUID(), part: randomUUID(), l: [randomUUID(), randomUUID(), randomUUID(), randomUUID()] };
      const course = courseVersions(cap, set, capClaim, "Synthetic capture course");
      const a1 = cap.assign(gym, owner, cap.publishGlobal(course.v1()), learner);
      const { error } = await learner.client.rpc("complete_lesson", { p_assignment: a1, p_lesson: set.l[0] });
      if (error) throw new Error(`seeding the v1 completion failed: ${error.message}`);
      const a2 = cap.assign(gym, owner, cap.publishGlobal(course.v2()), learner);
      const a3 = cap.assign(gym, owner, cap.publishGlobal(course.v3()), learner);
      cap.retract(capSource);

      const h1 = (page: Page) => page.getByRole("heading", { level: 1 });
      /** The overview shows this version number and exactly these lessons, in order. */
      const expectOverview = async (page: Page, version: string, lessons: string[]) => {
        await expect(h1(page)).toHaveText("Synthetic capture course");
        await expect(page.locator("main header").first()).toContainText(version);
        await expect(page.getByTestId("lesson-list").getByTestId("lesson-title")).toHaveText(lessons);
      };
      /** The player shows this lesson, its position and the version it belongs to. */
      const expectPlayer = async (page: Page, title: string, position: string, version: string) => {
        await expect(h1(page)).toHaveText(title);
        await expect(page.locator("article header")).toContainText(position);
        await expect(page.locator("article header")).toContainText(version);
      };
      const row = (page: Page, title: string) => page.getByRole("listitem").filter({ has: page.getByText(title, { exact: true }) });
      const shots: { name: string; path: string; check: (page: Page) => Promise<void> }[] = [
        {
          name: "list",
          path: learn(gym),
          check: async (page) => {
            await expect(h1(page)).toHaveText("Your courses");
            await expect(page.getByTestId("course-row")).toHaveCount(1);
            await expect(page.getByTestId("course-row")).toContainText("v3");
            await expect(page.getByRole("link", { name: /Resume lesson/ })).toHaveAttribute("href", learn(gym, a3, "lesson-4"));
          },
        },
        {
          name: "overview-v2",
          path: learn(gym, a2),
          check: async (page) => {
            await expectOverview(page, "v2", ["Synthetic lesson one", "Synthetic lesson two", "Synthetic lesson four"]);
            await expect(row(page, "Synthetic lesson one")).toContainText("Credited");
            await expect(page.getByText("A source cited in this version was retracted after it was published")).toBeVisible();
          },
        },
        {
          name: "overview-v3",
          path: learn(gym, a3),
          check: async (page) => {
            await expectOverview(page, "v3", ["Synthetic lesson one", "Synthetic lesson four"]);
            await expect(row(page, "Synthetic lesson one")).toContainText("Credited");
          },
        },
        {
          name: "player-l1-v2",
          path: learn(gym, a2, "lesson-one"),
          check: async (page) => {
            await expectPlayer(page, "Synthetic lesson one", "Lesson 1 of 3", "v2");
            await expect(page.locator('[data-block="paragraph"][data-support="science"]').getByText("Source retracted")).toBeVisible();
          },
        },
        {
          name: "player-l2-v2",
          path: learn(gym, a2, "lesson-2"),
          check: async (page) => {
            await expectPlayer(page, "Synthetic lesson two", "Lesson 2 of 3", "v2");
            await expect(page.getByRole("region", { name: "Lesson completion" })).toBeVisible();
          },
        },
      ];
      for (const [width, height, label] of [[1440, 900, "desktop"], [390, 844, "mobile"], [320, 700, "narrow"]] as const) {
        for (const reduced of [false, true]) {
          const context = await browser.newContext({ viewport: { width, height }, reducedMotion: reduced ? "reduce" : "no-preference", deviceScaleFactor: 2 });
          const page = await context.newPage();
          await page.goto(`/sign-in?next=${encodeURIComponent(learn(gym))}`);
          const before = await messageIds(learner.email);
          await page.getByLabel("Email").fill(learner.email);
          await page.getByRole("button", { name: "Email me a code" }).click();
          await page.getByLabel("6-digit code").fill(await codeAfter(learner.email, before));
          await page.getByRole("button", { name: "Sign in" }).click();
          await page.waitForURL(`**${learn(gym)}`);
          await new Promise((r) => setTimeout(r, 1100));
          for (const { name, path, check } of shots) {
            if (reduced && name !== "player-l2-v2") continue;
            await page.goto(path);
            await page.waitForLoadState("networkidle");
            await check(page);
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
            expect(overflow, `${name} at ${width}px scrolls sideways`).toBe(0);
            await page.screenshot({ path: `${dir}/${label}${reduced ? "-reduced" : ""}-${name}.png`, fullPage: true });
          }
          if (label === "desktop" && !reduced) {
            // Keyboard: the first focus stop is visible; then complete a lesson and capture the confirmation.
            await page.goto(learn(gym, a2, "lesson-2"));
            await expectPlayer(page, "Synthetic lesson two", "Lesson 2 of 3", "v2");
            await page.keyboard.press("Tab");
            await page.screenshot({ path: `${dir}/desktop-focus-first.png` });
            await page.getByRole("button", { name: "Mark lesson complete" }).focus();
            await page.screenshot({ path: `${dir}/desktop-focus-complete.png` });
            await page.keyboard.press("Enter");
            await expect(page.getByTestId("lesson-status")).toContainText("Saved.");
            // Capture the finished check, not a frame of its 320ms stroke.
            await expect.poll(() => page.locator(".confirm-check path").evaluate((el) => getComputedStyle(el).strokeDashoffset)).toBe("0px");
            await page.screenshot({ path: `${dir}/desktop-saved.png` });
          }
          await context.close();
        }
      }
    } finally {
      await cap.cleanup();
    }
  });

  test("the completion form cannot be pointed at another gym, assignment or lesson", async ({ browser }) => {
    const path = learn(gymA, assignments.partial, "lesson-3");
    const p = await signIn(browser, actors.partial!, path);
    const count = (where: string) => sql(`select count(*) from public.lesson_completions where ${where}`);
    const otherLesson = `user_id = '${actors.partial!.id}' and version_id = '${versions.v1}' and lesson_id = '${ids.l[1]}'`;
    const before = sql(`select coalesce(string_agg(id::text || completed_at::text, ','), '') from public.lesson_completions where ${otherLesson}`);
    // Plant the ids an attacker would send. The bound action ignores the form entirely.
    await p.locator('section[aria-label="Lesson completion"] form').evaluate(
      (form, forged) => {
        for (const [name, value] of Object.entries(forged)) {
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = name;
          input.value = value;
          form.appendChild(input);
        }
      },
      { gym: gymB.slug, assignmentId: assignments.multiB!, lessonId: ids.l[1]! },
    );
    await p.getByRole("button", { name: "Mark lesson complete" }).click();
    await expect(p.getByTestId("lesson-status")).toContainText("Saved.");
    expect(count(`user_id = '${actors.multi!.id}' and org_id = '${gymB.id}'`)).toBe("0");
    expect(count(`user_id = '${actors.partial!.id}' and version_id = '${versions.v1}' and lesson_id = '${ids.l[2]}'`)).toBe("1");
    expect(sql(`select coalesce(string_agg(id::text || completed_at::text, ','), '') from public.lesson_completions where ${otherLesson}`)).toBe(before);
  });

  test("the design specimen does not exist in production", async ({ page }) => {
    test.skip(!process.env.CI, "dev servers serve /design; the production build must not");
    const res = await page.goto("/design");
    expect(res?.status()).toBe(404);
    await expect(page.getByText("Design specimen")).toHaveCount(0);
  });
});

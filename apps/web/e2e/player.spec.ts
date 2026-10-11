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

function lessonOne(): LessonSpec {
  return {
    id: ids.l[0]!,
    slug: "lesson-one",
    title: "Synthetic lesson one",
    blocks: [
      { kind: "heading", content: "Synthetic heading" },
      { kind: "paragraph", content: "Synthetic science paragraph.", support: "science", claimIds: [claimId] },
      practice("Synthetic practice paragraph."),
      { kind: "callout", content: { label: "Synthetic note", text: "Synthetic callout." }, support: "practice-based", claimIds: [] },
      { kind: "checklist", content: ["Synthetic step one", "Synthetic step two"], support: "practice-based", claimIds: [] },
      { kind: "image", content: { kind: "image", src: `/media/content/${world.run}/absent.png`, alt: "Synthetic absent figure", caption: "Synthetic caption", provenanceId: "synthetic" } },
      { kind: "diagram", content: { diagramId: "synthetic-diagram", caption: "Synthetic diagram caption" } },
      {
        kind: "quiz",
        content: { prompt: "Synthetic question?", options: ["Synthetic A", "Synthetic B"], answerIndex: 1, explanation: "Synthetic explanation." },
        support: "science",
        claimIds: [claimId],
      },
    ],
    resources: [{ label: "Synthetic reference", href: "https://example.org/synthetic", type: "reference" }],
  };
}
const lesson = (i: number, title: string, text = `Synthetic text ${i}.`): LessonSpec => ({ id: ids.l[i]!, slug: `lesson-${i + 1}`, title, blocks: [practice(text)] });

const v1 = () => courseJson(ids.course, ids.part, "base", "Synthetic base course", [lessonOne(), lesson(1, "Synthetic lesson two"), lesson(2, "Synthetic lesson three")]);
// v2: lesson one unchanged, two edited, three removed, four added.
const v2 = () => courseJson(ids.course, ids.part, "base", "Synthetic base course", [lessonOne(), lesson(1, "Synthetic lesson two", "Synthetic text, revised."), lesson(3, "Synthetic lesson four")]);
// v3: lesson one still unchanged.
const v3 = () => courseJson(ids.course, ids.part, "base", "Synthetic base course", [lessonOne(), lesson(3, "Synthetic lesson four")]);

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
        media: [{ kind: "image", src: `/media/org/${gymA.id}/${world.run}/figure.png`, alt: "Synthetic gym figure", caption: "", provenanceId: "synthetic" }],
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
    await expect(p.locator('[data-block="callout"]')).toContainText("Synthetic callout.");
    await expect(p.locator('[data-block="checklist"] li')).toHaveCount(2);
    await expect(p.locator('[data-block="diagram"]')).toContainText("This diagram is not available yet.");
    // A storage object that does not exist: honest placeholder, no broken image.
    await expect(p.locator('[data-block="image"] [data-media="unavailable"]')).toContainText("Synthetic absent figure");
    // Ungraded self-check: feedback after checking, and it says nothing is saved.
    const quiz = p.locator('[data-block="quiz"]');
    await quiz.getByLabel("Synthetic A").check();
    await quiz.getByRole("button", { name: "Check answer" }).click();
    await expect(quiz).toContainText("Not quite. The answer is: Synthetic B");
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
  });

  test("method course is practice-based only and serves its gym's media to members", async ({ browser }) => {
    const p = await signIn(browser, actors.partial!, learn(gymA, assignments.method, "house-cues"));
    await expect(p.getByText("Gym method").first()).toBeVisible();
    await expect(p.getByText("Science", { exact: true })).toHaveCount(1); // the legend only
    await expect(p.locator('[data-support="science"]')).toHaveCount(0);
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
  });

  test("progress persists across reload and a fresh session; duplicate completion counts once", async ({ browser }) => {
    const path = learn(gymA, assignments.partial, "lesson-one");
    const p = await signIn(browser, actors.partial!, path);
    const button = p.getByRole("button", { name: "Mark lesson complete" });
    await button.dblclick();
    await expect(p.getByTestId("lesson-status")).toContainText("Saved.");
    await expect(p.getByTestId("lesson-status")).toContainText("v1");
    // A second tab submits the same completion: the RPC returns the same row.
    const second = await p.context().newPage();
    await second.goto(path);
    await expect(second.getByTestId("lesson-status")).toContainText("Completed.");
    const rows = () => sql(`select count(*) || ':' || min(completed_at)::text from public.lesson_completions where user_id = '${actors.partial!.id}' and lesson_id = '${ids.l[0]}' and version_id = '${versions.v1}'`);
    const first = rows();
    expect(first.startsWith("1:")).toBe(true);
    await p.reload();
    await expect(p.getByTestId("lesson-status")).toContainText("Completed.");
    await p.goto(learn(gymA, assignments.partial));
    await expect(p.getByText("1 of 3 lessons done")).toBeVisible();
    const fresh = await signIn(browser, actors.partial!, learn(gymA, assignments.partial));
    await expect(fresh.getByText("1 of 3 lessons done")).toBeVisible();
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
    await expect(f.getByText("1 of 3 lessons done")).toBeVisible();
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
    await expect(p.getByTestId("lesson-status")).toContainText("Credited.");
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
    await expect(m.getByText("0 of 3 lessons done")).toBeVisible();
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
    await expect(p.getByText("1 of 3 lessons done")).toBeVisible();
    await p.goto(learn(gymA, assignments.partial, "lesson-one"));
    await expect(p.locator('[data-block="paragraph"][data-support="science"]').getByText("Source retracted")).toBeVisible();
    await p.goto(learn(gymA, assignments.partial, "lesson-2"));
    await p.getByRole("button", { name: "Mark lesson complete" }).click();
    await expect(p.getByTestId("lesson-status")).toContainText("Saved.");
  });

  test("captures rendered learner states for design review", async ({ browser }) => {
    const dir = process.env.PLAYER_CAPTURE_DIR;
    test.skip(!dir, "set PLAYER_CAPTURE_DIR to capture design evidence");
    const shots: [string, string][] = [
      ["list", learn(gymA)],
      ["overview-v2", learn(gymA, assignments.partial2)],
      ["player-l1-v2", learn(gymA, assignments.partial2, "lesson-one")],
      ["player-l2-v2", learn(gymA, assignments.partial2, "lesson-2")],
    ];
    for (const [width, height, label] of [[1440, 900, "desktop"], [390, 844, "mobile"], [320, 700, "narrow"]] as const) {
      for (const reduced of [false, true]) {
        const context = await browser.newContext({ viewport: { width, height }, reducedMotion: reduced ? "reduce" : "no-preference", deviceScaleFactor: 2 });
        const page = await context.newPage();
        await page.goto(`/sign-in?next=${encodeURIComponent(learn(gymA))}`);
        const before = await messageIds(actors.partial!.email);
        await page.getByLabel("Email").fill(actors.partial!.email);
        await page.getByRole("button", { name: "Email me a code" }).click();
        await page.getByLabel("6-digit code").fill(await codeAfter(actors.partial!.email, before));
        await page.getByRole("button", { name: "Sign in" }).click();
        await page.waitForURL(`**${learn(gymA)}`);
        await new Promise((r) => setTimeout(r, 1100));
        for (const [name, path] of shots) {
          if (reduced && name !== "player-l2-v2") continue;
          await page.goto(path);
          await page.waitForLoadState("networkidle");
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          expect(overflow, `${name} at ${width}px scrolls sideways`).toBe(0);
          await page.screenshot({ path: `${dir}/${label}${reduced ? "-reduced" : ""}-${name}.png`, fullPage: true });
        }
        if (label === "desktop" && !reduced) {
          // Keyboard: the first focus stop is visible; then complete a lesson and capture the confirmation.
          await page.goto(learn(gymA, assignments.partial2, "lesson-2"));
          await page.keyboard.press("Tab");
          await page.screenshot({ path: `${dir}/desktop-focus-first.png` });
          await page.getByRole("button", { name: "Mark lesson complete" }).focus();
          await page.screenshot({ path: `${dir}/desktop-focus-complete.png` });
          await page.keyboard.press("Enter");
          await expect(page.getByTestId("lesson-status")).toContainText("Saved.");
          await page.screenshot({ path: `${dir}/desktop-saved.png` });
        }
        await context.close();
      }
    }
  });

  test("the design specimen does not exist in production", async ({ page }) => {
    test.skip(!process.env.CI, "dev servers serve /design; the production build must not");
    const res = await page.goto("/design");
    expect(res?.status()).toBe(404);
    await expect(page.getByText("Design specimen")).toHaveCount(0);
  });
});

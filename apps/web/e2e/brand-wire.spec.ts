import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { courseJson, PlayerWorld, type Actor, type Json } from "./player-fixtures";
import { learnPath, signIn } from "./helpers/sign-in";

// P4-A2 wired to real data: the member landing and the player read public.member_brand and
// public.version_tenant_texts through the #43 parsers. Synthetic gyms:
//   A saved a brand and had every text admitted; one course has v1 assigned and a newer v2 published
//     but not assigned; another has v1 and v2 both assigned.
//   B saved a brand and nothing was admitted; its published course title was revoked afterwards.
//   C has no brand; its course title was revoked (the unbranded list).
// Texts are admitted and revoked only through the publisher RPCs.

test.describe.configure({ mode: "serial" });

const world = new PlayerWorld();
const actors: Record<string, Actor> = {};
let gymA: { id: string; slug: string };
let gymB: { id: string; slug: string };
let gymC: { id: string; slug: string };
let gymD: { id: string; slug: string };
const assignments: Record<string, string> = {};
const texts: Record<string, string> = {};

/** Gym B's and C's unadmitted or revoked texts: none may reach any member response, visible or not. */
const FORBIDDEN = ["Example Pilates Studio", "Move with intention.", "A note that was never admitted.", "Reformer cueing", "Mat class structure"];

const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
const practice = (text: string): Json => ({ kind: "paragraph", content: text, support: "practice-based", claimIds: [] });

function methodCourse(title: string, cover: Json, id = randomUUID(), partId = randomUUID(), lessonIds = [randomUUID(), randomUUID()]): Json {
  const course = courseJson(id, partId, "method", title, [
    { id: lessonIds[0]!, slug: "first", title: "First lesson", blocks: [practice("Synthetic first lesson.")] },
    { id: lessonIds[1]!, slug: "second", title: "Second lesson", blocks: [practice("Synthetic second lesson.")] },
  ]);
  return { ...course, cover, tags: ["strength"] };
}

/** The raw HTML and the RSC payload of a route, as the signed-in page's own session fetches them. */
async function payloads(page: Page, path: string): Promise<string> {
  const html = await page.request.get(path);
  const rsc = await page.request.get(path, { headers: { RSC: "1" } });
  return `${await html.text()}\n${await rsc.text()}`;
}

async function axeClean(page: Page, what: string) {
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.length}`), what).toEqual([]);
}

test.beforeAll(async () => {
  test.setTimeout(180_000);
  world.publisher();
  for (const name of ["owner", "trainer", "outsider", "newbie"]) actors[name] = await world.actor(name);
  gymA = world.gym("branda", actors.owner!);
  gymB = world.gym("brandb", actors.owner!);
  gymC = world.gym("plainc", actors.owner!);
  gymD = world.gym("legacyd", actors.owner!);
  for (const g of [gymA, gymB, gymC, gymD]) world.join(g, actors.owner!, actors.trainer!);
  // Gym D: a brand stored before Lab, with no dark accent pair (Sol R2 on #51).
  world.legacyBrand(gymD, actors.owner!, { mark: { kind: "text" }, colors: { accent: "#506e4b", onAccent: "#ffffff", band: "#0b3d2e" }, font: "geist" });
  world.join(gymA, actors.owner!, actors.outsider!);
  world.join(gymA, actors.owner!, actors.newbie!);

  // Gym A: a saved brand and every gym text admitted.
  world.saveBrand(gymA, actors.owner!, { mark: { kind: "text" }, colors: { accent: "#7a1b26", onAccent: "#ffffff", accentDark: "#f2877e", onAccentDark: "#0b0d12", band: "#17232b" }, font: "barlow-condensed" });
  for (const [slot, text] of [
    ["brand_name", "Example Strength Club"],
    ["catalog_headline", "Lift well. Coach better."],
    ["catalog_tagline", "Our method for teaching the barbell."],
    ["coach_name", "Coach A. Example"],
  ] as const) {
    texts[slot] = world.saveText(gymA, actors.owner!, slot, null, text);
    world.admitText(texts[slot]!);
  }
  // A1: one version, with an admitted welcome note and blurb.
  const a1 = methodCourse("Squat pattern coaching", { kind: "pattern", pattern: "diagonal", background: "#17232b", foreground: "#ffffff" });
  world.saveMethodDraft(gymA, actors.owner!, a1);
  texts.welcome = world.saveText(gymA, actors.owner!, "welcome", String(a1.id), "Learn the squat the way we teach it on our floor.");
  world.admitText(texts.welcome);
  texts.blurb = world.saveText(gymA, actors.owner!, "course_blurb", String(a1.id), "How we set up, cue and progress the squat.");
  world.admitText(texts.blurb);
  assignments.a1 = world.assign(gymA, actors.owner!, world.publishMethod(gymA, actors.owner!, a1), actors.trainer!);
  // A2: v1 assigned; v2 (a new title) published but not assigned. The card must describe v1.
  const a2v1 = methodCourse("Deadlift basics", { kind: "pattern", pattern: "grid", background: "#7a1b26", foreground: "#ffffff" });
  world.saveMethodDraft(gymA, actors.owner!, a2v1);
  assignments.a2 = world.assign(gymA, actors.owner!, world.publishMethod(gymA, actors.owner!, a2v1), actors.trainer!);
  world.publishMethod(gymA, actors.owner!, { ...a2v1, title: "Deadlift basics, revised" });
  // A3: v1 and v2 both assigned: the card opens v2 and v1 stays reachable.
  const a3v1 = methodCourse("Bench press coaching", { kind: "pattern", pattern: "rings", background: "#17232b", foreground: "#ffffff" });
  world.saveMethodDraft(gymA, actors.owner!, a3v1);
  assignments.a3v1 = world.assign(gymA, actors.owner!, world.publishMethod(gymA, actors.owner!, a3v1), actors.trainer!);
  assignments.a3v2 = world.assign(gymA, actors.owner!, world.publishMethod(gymA, actors.owner!, { ...a3v1, subtitle: "Revised" }), actors.trainer!);

  // Gym B: a saved brand and nothing admitted; the course title is revoked after publishing.
  world.saveBrand(gymB, actors.owner!, { mark: { kind: "text" }, colors: { accent: "#5b3a7a", onAccent: "#ffffff", accentDark: "#c3a6ff", onAccentDark: "#0b0d12", band: "#e8efe6" }, font: "fraunces" });
  world.saveText(gymB, actors.owner!, "brand_name", null, "Example Pilates Studio");
  world.saveText(gymB, actors.owner!, "catalog_headline", null, "Move with intention.");
  const b = methodCourse("Reformer cueing", { kind: "pattern", pattern: "waves", background: "#2f6b57", foreground: "#ffffff" });
  world.saveMethodDraft(gymB, actors.owner!, b);
  world.saveText(gymB, actors.owner!, "welcome", String(b.id), "A note that was never admitted.");
  assignments.b = world.assign(gymB, actors.owner!, world.publishMethod(gymB, actors.owner!, b), actors.trainer!);
  world.revokeTitle(String(b.id));

  // Gym C: no brand; the course title is revoked (the unbranded list).
  const c = methodCourse("Mat class structure", { kind: "pattern", pattern: "dots", background: "#17232b", foreground: "#ffffff" });
  world.saveMethodDraft(gymC, actors.owner!, c);
  assignments.c = world.assign(gymC, actors.owner!, world.publishMethod(gymC, actors.owner!, c), actors.trainer!);
  world.revokeTitle(String(c.id));
});

test.afterAll(async () => {
  await world.cleanup();
});

test("a branded gym with admitted texts: band header, hero, course cards, and the coach note on the first lesson", async ({ browser }) => {
  const page = await signIn(browser, actors.trainer!, learnPath(gymA));
  const header = page.locator("header[data-brand-header]");
  await expect(header).toHaveCSS("background-color", rgb("#17232b"));
  await expect(header.locator("[data-brand-name]")).toHaveText("Example Strength Club");
  await expect(page.locator("[data-hero-headline]")).toHaveText("Lift well. Coach better.");
  await expect(page.locator("[data-hero-tagline]")).toHaveText("Our method for teaching the barbell.");
  // Nothing is started yet, so the action starts the first course.
  await expect(page.locator("[data-catalog-action]")).toContainText("Start your first course");
  const card = page.locator("a[data-course-card]", { hasText: "Squat pattern coaching" });
  await expect(card).toContainText("How we set up, cue and progress the squat.");
  await expect(card.locator("svg[data-pattern]")).toHaveAttribute("data-pattern", "diagonal");
  await expect(card).toHaveAttribute("href", learnPath(gymA, assignments.a1!));

  await page.goto(learnPath(gymA, assignments.a1!, "first"));
  const note = page.locator("[data-coach-note]");
  await expect(note).toContainText("Note from Coach A. Example");
  await expect(note).toContainText("Learn the squat the way we teach it on our floor.");
  await expect(note).toContainText("Practice-based");
  await page.goto(learnPath(gymA, assignments.a1!, "second"));
  await expect(page.locator("[data-coach-note]")).toHaveCount(0);
});

test("a card describes the version it opens, and earlier assigned versions stay reachable", async ({ browser }) => {
  const page = await signIn(browser, actors.trainer!, learnPath(gymA));
  // v2 of "Deadlift basics" is published but not assigned: the card shows and opens v1.
  const deadlift = page.locator("a[data-course-card]", { hasText: "Deadlift basics" });
  await expect(deadlift).toHaveAttribute("href", learnPath(gymA, assignments.a2!));
  await expect(deadlift.locator("[data-course-title]")).toHaveText("Deadlift basics");
  await expect(page.getByText("Deadlift basics, revised")).toHaveCount(0);
  // Both versions of "Bench press coaching" are assigned: the card opens v2, and v1 is a link beside it.
  const bench = page.locator("a[data-course-card]", { hasText: "Bench press coaching" });
  await expect(bench).toHaveAttribute("href", learnPath(gymA, assignments.a3v2!));
  await expect(page.getByRole("link", { name: "Version 1" })).toHaveAttribute("href", learnPath(gymA, assignments.a3v1!));
});

test("a gym with nothing admitted shows the fixed fallbacks, and no unadmitted text reaches HTML or RSC payloads", async ({ browser }) => {
  const page = await signIn(browser, actors.trainer!, learnPath(gymB));
  const header = page.locator("header[data-brand-header]");
  await expect(header).toHaveCSS("background-color", rgb("#e8efe6"));
  await expect(header.locator("[data-brand-name]")).toHaveText("Your gym");
  await expect(page.locator("[data-hero-headline]")).toHaveText("Your gym");
  await expect(page.locator("[data-hero-tagline]")).toHaveCount(0);
  await expect(page.locator("a[data-course-card] [data-course-title]").first()).toHaveText("Untitled course");
  await expect(page).not.toHaveTitle(/Example Pilates|Reformer/);

  await page.goto(learnPath(gymB, assignments.b!));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Untitled course");
  await page.goto(learnPath(gymB, assignments.b!, "first"));
  await expect(page.locator("[data-coach-note]")).toHaveCount(0);

  for (const path of [learnPath(gymB), learnPath(gymB, assignments.b!), learnPath(gymB, assignments.b!, "first")]) {
    const body = await payloads(page, path);
    for (const text of FORBIDDEN) expect(body, `${text} in ${path}`).not.toContain(text);
  }
});

test("an unbranded gym keeps the standard list, and its revoked title reads 'Untitled course' everywhere", async ({ browser }) => {
  const page = await signIn(browser, actors.trainer!, learnPath(gymC));
  await expect(page.locator("header[data-brand-header]")).toHaveCount(0);
  await expect(page.getByText("Untitled course").first()).toBeVisible();
  for (const path of [learnPath(gymC), learnPath(gymC, assignments.c!), learnPath(gymC, assignments.c!, "first")]) {
    const body = await payloads(page, path);
    expect(body, path).not.toContain("Mat class structure");
  }
});

test("a brand stored before Lab (no dark pair) renders the standard look, never an error (Sol R2 on #51)", async ({ browser }) => {
  const page = await signIn(browser, actors.trainer!, learnPath(gymD));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/Could not load this gym/)).toHaveCount(0);
  await expect(page.locator("header[data-brand-header]")).toHaveCount(0);
  // The legacy band never reaches the page.
  expect(await page.evaluate(() => [...document.querySelectorAll("*")].some((el) => getComputedStyle(el).backgroundColor === "rgb(11, 61, 46)"))).toBe(false);
});

test("another gym's brand never reaches a non-member or a signed-out visitor", async ({ browser, request }) => {
  const page = await signIn(browser, actors.outsider!, learnPath(gymA));
  // Learn routes resolve the gym inside Suspense, so a non-member gets the not-found page with status
  // 200 (a pre-existing soft 404, reported separately). What matters here: nothing of gym B leaks.
  await page.goto(learnPath(gymB));
  await expect(page.locator("header[data-brand-header]")).toHaveCount(0);
  const body = await payloads(page, learnPath(gymB));
  for (const text of FORBIDDEN) expect(body).not.toContain(text);
  const anon = await request.get(learnPath(gymA), { maxRedirects: 0 });
  expect([302, 303, 307, 308]).toContain(anon.status());
  expect(await anon.text()).not.toContain("Example Strength Club");
});

test("the wired routes pass axe AA at 320 and 1440, keep a keyboard path, and an empty catalog says so", async ({ browser }) => {
  const page = await signIn(browser, actors.trainer!, learnPath(gymA));
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [learnPath(gymA), learnPath(gymB), learnPath(gymA, assignments.a1!, "first")]) {
      await page.goto(path);
      await expect(page.getByRole("main")).toBeVisible();
      await axeClean(page, `${path} at ${width}`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${path} at ${width}`).toBe(0);
    }
  }
  // Keyboard: header links, then the action, then one stop per card.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(learnPath(gymA));
  await expect(page.locator("a[data-course-card]").first()).toBeVisible();
  const stops = [...(await page.locator("header[data-brand-header] a").all()), page.locator("[data-catalog-action]"), ...(await page.locator("a[data-course-card]").all())];
  await stops[0]!.focus();
  for (const [i, stop] of stops.entries()) {
    if (i > 0) await page.keyboard.press("Tab");
    // Earlier-version links sit beside their card, so Tab may pass through one; skip to the card.
    if (i > 0 && !(await stop.evaluate((el) => el === document.activeElement))) await page.keyboard.press("Tab");
    await expect(stop, `stop ${i + 1}`).toBeFocused();
  }

  const newbie = await signIn(browser, actors.newbie!, learnPath(gymA));
  await expect(newbie.getByText("Nothing is assigned to you in this gym yet.")).toBeVisible();
  await expect(newbie.locator("[data-catalog-action]")).toHaveCount(0);
  await axeClean(newbie, "empty catalog");
});

test("revocations after a member has seen the texts take effect on the next load", async ({ browser }) => {
  const page = await signIn(browser, actors.trainer!, learnPath(gymA, assignments.a1!, "first"));
  await expect(page.locator("[data-coach-note]")).toBeVisible();
  world.revokeText(texts.welcome!);
  world.revokeText(texts.blurb!);
  world.revokeText(texts.brand_name!);
  await page.reload();
  await expect(page.locator("[data-coach-note]")).toHaveCount(0);
  await page.goto(learnPath(gymA));
  await expect(page.locator("header[data-brand-header] [data-brand-name]")).toHaveText("Your gym");
  await expect(page.locator("a[data-course-card]", { hasText: "Squat pattern coaching" })).not.toContainText("How we set up");
  const body = `${await payloads(page, learnPath(gymA))}\n${await payloads(page, learnPath(gymA, assignments.a1!, "first"))}`;
  for (const text of ["Example Strength Club", "Learn the squat the way we teach it", "How we set up, cue and progress the squat."]) expect(body).not.toContain(text);
});

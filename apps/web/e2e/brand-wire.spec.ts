import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { courseJson, PlayerWorld, type Actor, type Json } from "./player-fixtures";
import { learnPath, signIn } from "./helpers/sign-in";

// P4-A2 wired to real data: the member landing and the player read public.member_brand,
// public.member_course_cards and public.version_tenant_texts through the #43 parsers. Two synthetic
// gyms: A saved a brand and had every text admitted; B saved a brand and nothing was admitted, and
// its published course title was revoked afterwards. Texts are admitted and revoked only through
// the publisher RPCs.

test.describe.configure({ mode: "serial" });

const world = new PlayerWorld();
const actors: Record<string, Actor> = {};
let gymA: { id: string; slug: string };
let gymB: { id: string; slug: string };
const assignments: Record<string, string> = {};

const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
const practice = (text: string): Json => ({ kind: "paragraph", content: text, support: "practice-based", claimIds: [] });

function methodCourse(title: string, cover: Json): Json {
  const course = courseJson(randomUUID(), randomUUID(), "method", title, [
    { id: randomUUID(), slug: "first", title: "First lesson", blocks: [practice("Synthetic first lesson.")] },
    { id: randomUUID(), slug: "second", title: "Second lesson", blocks: [practice("Synthetic second lesson.")] },
  ]);
  return { ...course, cover, tags: ["strength"] };
}

test.beforeAll(async () => {
  test.setTimeout(120_000);
  world.publisher();
  for (const name of ["owner", "trainer"]) actors[name] = await world.actor(name);
  gymA = world.gym("branda", actors.owner!);
  gymB = world.gym("brandb", actors.owner!);
  world.join(gymA, actors.owner!, actors.trainer!);
  world.join(gymB, actors.owner!, actors.trainer!);

  // Gym A: a saved brand, every gym text admitted, a method course with an admitted welcome and blurb.
  world.saveBrand(gymA, actors.owner!, { mark: { kind: "text" }, colors: { accent: "#7a1b26", onAccent: "#ffffff", band: "#17232b" }, font: "barlow-condensed" });
  for (const [slot, text] of [
    ["brand_name", "Example Strength Club"],
    ["catalog_headline", "Lift well. Coach better."],
    ["catalog_tagline", "Our method for teaching the barbell."],
    ["coach_name", "Coach A. Example"],
  ] as const)
    world.admitText(world.saveText(gymA, actors.owner!, slot, null, text));
  const a = methodCourse("Squat pattern coaching", { kind: "pattern", pattern: "diagonal", background: "#17232b", foreground: "#ffffff" });
  world.saveMethodDraft(gymA, actors.owner!, a);
  world.admitText(world.saveText(gymA, actors.owner!, "welcome", String(a.id), "Learn the squat the way we teach it on our floor."));
  world.admitText(world.saveText(gymA, actors.owner!, "course_blurb", String(a.id), "How we set up, cue and progress the squat."));
  assignments.a = world.assign(gymA, actors.owner!, world.publishMethod(gymA, actors.owner!, a), actors.trainer!);

  // Gym B: a saved brand and nothing admitted; its course's title is revoked after publishing, and
  // its welcome note was saved but never admitted.
  world.saveBrand(gymB, actors.owner!, { mark: { kind: "text" }, colors: { accent: "#2f6b57", onAccent: "#ffffff", band: "#e8efe6" }, font: "fraunces" });
  world.saveText(gymB, actors.owner!, "brand_name", null, "Example Pilates Studio");
  world.saveText(gymB, actors.owner!, "catalog_headline", null, "Move with intention.");
  const b = methodCourse("Reformer cueing", { kind: "pattern", pattern: "waves", background: "#2f6b57", foreground: "#ffffff" });
  world.saveMethodDraft(gymB, actors.owner!, b);
  world.saveText(gymB, actors.owner!, "welcome", String(b.id), "A note that was never admitted.");
  assignments.b = world.assign(gymB, actors.owner!, world.publishMethod(gymB, actors.owner!, b), actors.trainer!);
  world.revokeTitle(String(b.id));
});

test.afterAll(async () => {
  await world.cleanup();
});

test("a branded gym with admitted texts: band header, hero, course card, and the coach note on the first lesson", async ({ browser }) => {
  const page = await signIn(browser, actors.trainer!, learnPath(gymA));
  const header = page.locator("header[data-brand-header]");
  await expect(header).toHaveCSS("background-color", rgb("#17232b"));
  await expect(header.locator("[data-brand-name]")).toHaveText("Example Strength Club");
  await expect(page.locator("[data-hero-headline]")).toHaveText("Lift well. Coach better.");
  await expect(page.locator("[data-hero-tagline]")).toHaveText("Our method for teaching the barbell.");
  const card = page.locator("a[data-course-card]", { hasText: "Squat pattern coaching" });
  await expect(card).toContainText("How we set up, cue and progress the squat.");
  await expect(card.locator("svg[data-pattern]")).toHaveAttribute("data-pattern", "diagonal");
  await expect(card).toHaveAttribute("href", learnPath(gymA, assignments.a!));

  await page.goto(learnPath(gymA, assignments.a!, "first"));
  const note = page.locator("[data-coach-note]");
  await expect(note).toContainText("Note from Coach A. Example");
  await expect(note).toContainText("Learn the squat the way we teach it on our floor.");
  await expect(note).toContainText("Practice-based");
  await page.goto(learnPath(gymA, assignments.a!, "second"));
  await expect(page.locator("[data-coach-note]")).toHaveCount(0);
});

test("a gym with nothing admitted shows the fixed fallbacks, and a revoked course title reads 'Untitled course'", async ({ browser }) => {
  const page = await signIn(browser, actors.trainer!, learnPath(gymB));
  const header = page.locator("header[data-brand-header]");
  await expect(header).toHaveCSS("background-color", rgb("#e8efe6"));
  await expect(header.locator("[data-brand-name]")).toHaveText("Your gym");
  await expect(page.locator("[data-hero-headline]")).toHaveText("Your gym");
  await expect(page.locator("[data-hero-tagline]")).toHaveCount(0);
  await expect(page.getByText("Example Pilates Studio")).toHaveCount(0);
  await expect(page.getByText("Move with intention.")).toHaveCount(0);
  const card = page.locator("a[data-course-card]").first();
  await expect(card.locator("[data-course-title]")).toHaveText("Untitled course");
  await expect(page.getByText("Reformer cueing")).toHaveCount(0);

  await page.goto(learnPath(gymB, assignments.b!));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Untitled course");
  await page.goto(learnPath(gymB, assignments.b!, "first"));
  await expect(page.getByText("Reformer cueing")).toHaveCount(0);
  await expect(page.locator("[data-coach-note]")).toHaveCount(0);
  await expect(page.getByText("A note that was never admitted.")).toHaveCount(0);
});

import { expect, test } from "@playwright/test";
import { PlayerWorld, type Actor } from "./player-fixtures";
import { signIn } from "./helpers/sign-in";

// The publisher admission screen (P4-A2: "a LEAD tool, not tenant UI"): content publishers review
// pending held texts with their full text, slot and hash, and admit or reject them; everyone else
// gets a hard 404. Synthetic gym, owner, trainer and publisher only.

test.describe.configure({ mode: "serial" });

const PATH = "/publisher/tenant-texts";
const world = new PlayerWorld();
const actors: Record<string, Actor> = {};
let gym: { id: string; slug: string };
const texts: Record<string, string> = {};

test.beforeAll(async () => {
  test.setTimeout(120_000);
  world.publisher();
  for (const name of ["owner", "trainer", "pub"]) actors[name] = await world.actor(name);
  world.makePublisher(actors.pub!);
  gym = world.gym("admit", actors.owner!);
  world.join(gym, actors.owner!, actors.trainer!);
  texts.headline = world.saveText(gym, actors.owner!, "catalog_headline", null, "Lift well. Coach better.");
  texts.tagline = world.saveText(gym, actors.owner!, "catalog_tagline", null, "Our method for teaching the barbell.");
});

test.afterAll(async () => {
  await world.cleanup();
});

test("is a hard 404 for anyone who is not a content publisher", async ({ browser, request }) => {
  const anon = await request.get(PATH, { maxRedirects: 0 });
  expect(anon.status(), "signed out").toBe(404);
  for (const who of ["owner", "trainer"]) {
    const page = await signIn(browser, actors[who]!, "/gyms");
    const res = await page.goto(PATH);
    expect(res?.status(), who).toBe(404);
    await expect(page.getByText("Lift well. Coach better.")).toHaveCount(0);
  }
});

test("a publisher sees each pending text in full, with its slot, gym and hash", async ({ browser }) => {
  const page = await signIn(browser, actors.pub!, PATH);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Held texts awaiting admission");
  const row = page.locator(`[data-text-id="${texts.headline}"]`);
  await expect(row).toContainText("Lift well. Coach better.");
  await expect(row).toContainText("catalog_headline");
  await expect(row).toContainText("Synthetic gym ADMIT");
  const hash = await row.locator("[data-text-hash]").textContent();
  expect(hash).toMatch(/^[0-9a-f]{64}$/);
  await expect(row.getByRole("button", { name: "Admit" })).toBeVisible();
  await expect(row.getByRole("button", { name: "Reject" })).toBeVisible();
});

test("admit and reject go through publisher_decide_tenant_text, and history is read-only", async ({ browser }) => {
  const page = await signIn(browser, actors.pub!, PATH);
  await page.locator(`[data-text-id="${texts.headline}"]`).getByRole("button", { name: "Admit" }).click();
  const tagline = page.locator(`[data-text-id="${texts.tagline}"]`);
  await tagline.getByLabel("Reason").fill("Reads as an outcome claim.");
  await tagline.getByRole("button", { name: "Reject" }).click();

  const history = page.locator("[data-admission-history]");
  await expect(history.locator(`[data-history-id="${texts.headline}"]`)).toContainText("Admitted");
  await expect(history.locator(`[data-history-id="${texts.tagline}"]`)).toContainText("Rejected");
  await expect(history.locator(`[data-history-id="${texts.tagline}"]`)).toContainText("Reads as an outcome claim.");
  await expect(history.getByRole("button")).toHaveCount(0);
  await expect(page.locator("[data-pending] [data-text-id]")).toHaveCount(0);
  expect(world.textStatus(texts.headline!)).toBe("admitted");
  expect(world.textStatus(texts.tagline!)).toBe("rejected");
});

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
  for (const name of ["owner", "trainer", "pub", "outsider"]) actors[name] = await world.actor(name);
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

test("adversarial requests: encoded paths, RSC, direct RPCs and forged-origin actions never decide a text", async ({ browser, request }) => {
  // Encoded and doubled spellings and RSC requests are 404 too, signed out and signed in.
  for (const path of ["/%70ublisher/tenant-texts", "//publisher/tenant-texts", "/publisher/../publisher/tenant-texts", "/Publisher/Tenant-Texts"]) {
    expect((await request.get(path, { maxRedirects: 0 })).status(), `anon ${path}`).toBe(404);
  }
  for (const who of ["owner", "trainer", "outsider"]) {
    const page = await signIn(browser, actors[who]!, "/gyms");
    for (const path of [PATH, "/%70ublisher/tenant-texts"]) {
      expect((await page.request.get(path)).status(), `${who} ${path}`).toBe(404);
      const rsc = await page.request.get(`${path}?_rsc=x`, { headers: { RSC: "1" } });
      expect(rsc.status(), `${who} RSC ${path}`).toBe(404);
      expect(await rsc.text()).not.toContain("Lift well. Coach better.");
    }
  }
  // Direct RPC calls from non-publishers, with the real hash: refused, nothing recorded.
  const hash = world.textHash(texts.headline!);
  for (const who of ["owner", "trainer"]) {
    const client = world.client(who);
    const list = await client.rpc("admission_tenant_texts");
    expect(list.error?.code, `${who} list`).toBe("42501");
    const decide = await client.rpc("admission_decide_tenant_text", { p_text: texts.headline, p_decision: { decision: "admitted", reason: "x", textHash: hash } });
    expect(decide.error?.code, `${who} decide`).toBe("42501");
  }
  // A forged hash from the publisher is refused too.
  const forged = await world.client("pub").rpc("admission_decide_tenant_text", { p_text: texts.headline, p_decision: { decision: "admitted", reason: "x", textHash: "f".repeat(64) } });
  expect(forged.error).not.toBeNull();
  // A server action posted with a foreign Origin, as the publisher, is refused by Next before it runs.
  const pub = await signIn(browser, actors.pub!, PATH);
  const actionId = await pub.locator('form input[name^="$ACTION_ID_"]').first().getAttribute("name");
  expect(actionId).toBeTruthy();
  const forgedPost = await pub.request.post(PATH, {
    headers: { Origin: "https://attacker.example" },
    multipart: { [actionId!]: "", textId: texts.headline!, textHash: hash, decision: "admitted", reason: "forged" },
    maxRedirects: 0,
  });
  expect(forgedPost.status(), "forged-origin action").toBeGreaterThanOrEqual(400);
  expect(world.textStatus(texts.headline!)).toBe("pending");
  expect(world.textStatus(texts.tagline!)).toBe("pending");
});

test("an unknown error key shows no message and does not break the page", async ({ browser }) => {
  const page = await signIn(browser, actors.pub!, `${PATH}?error=__proto__`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Held texts awaiting admission");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("a publisher sees each pending text in full, with its slot, gym and hash", async ({ browser }) => {
  const page = await signIn(browser, actors.pub!, PATH);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Held texts awaiting admission");
  // Texts are grouped by gym: the row sits in its gym's group.
  const row = page.getByRole("region", { name: "Synthetic gym ADMIT" }).locator(`[data-text-id="${texts.headline}"]`);
  await expect(row).toContainText("Lift well. Coach better.");
  await expect(row).toContainText("catalog_headline");
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

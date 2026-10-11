import { expect, test, type Browser, type Page } from "@playwright/test";

const MAILPIT = "http://127.0.0.1:54324";
const run = Date.now().toString(36);
const alice = `alice-${run}@a.test`;
const tess = `tess-${run}@a.test`;
const bob = `bob-${run}@b.test`;
const gymA = `gym-a-${run}`;

async function latestCode(email: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=1`);
    const { messages } = (await res.json()) as { messages: { ID: string }[] };
    if (messages[0]) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json()) as { Text: string };
      const code = /\b(\d{6})\b/.exec(msg.Text)?.[1];
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no sign-in code for ${email}`);
}

async function signIn(browser: Browser, email: string, next = "/gyms"): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel("6-digit code").fill(await latestCode(email));
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`**${next}`);
  return page;
}

test("each gym's data stays inside that gym", async ({ browser }) => {
  // Signed-out visitors are sent to sign-in.
  const anon = await (await browser.newContext()).newPage();
  await anon.goto("/gyms");
  await expect(anon).toHaveURL(/\/sign-in\?next=%2Fgyms/);

  // Alice creates gym A and invites Tess as a trainer.
  const a = await signIn(browser, alice);
  await a.getByLabel("Gym name").fill("Gym A");
  await a.getByLabel(/Web address/).fill(gymA);
  await a.getByRole("button", { name: "Create gym" }).click();
  await expect(a.getByRole("heading", { name: "Gym A" })).toBeVisible();
  await a.getByLabel("Staff email").fill(tess);
  await a.getByRole("button", { name: "Create invite link" }).click();
  const link = await a.getByTestId("invite-link").innerText();
  expect(link).toMatch(/^\/invite\/[0-9a-f]{48}$/);

  // Bob cannot use Tess's invite, and cannot see gym A.
  const b = await signIn(browser, bob, link);
  await b.getByRole("button", { name: "Accept invite" }).click();
  await expect(b.getByRole("alert").filter({ hasText: "different email" })).toBeVisible();
  // The page streams, so the status is sent before notFound(); assert content instead.
  await b.goto(`/gyms/${gymA}`);
  await expect(b.getByText(/could not be found/i)).toBeVisible();
  await expect(b.getByRole("heading", { name: "Gym A" })).toHaveCount(0);
  await b.goto("/gyms");
  await expect(b.getByText("Gym A")).toHaveCount(0);

  // Tess accepts and lands in gym A as a trainer, without invite rights.
  const t = await signIn(browser, tess, link);
  await t.getByRole("button", { name: "Accept invite" }).click();
  await expect(t.getByRole("heading", { name: "Gym A" })).toBeVisible();
  await expect(t.getByText("trainer").first()).toBeVisible();
  await expect(t.getByRole("button", { name: "Create invite link" })).toHaveCount(0);

  // Alice now sees two members.
  await a.reload();
  await expect(a.locator("section li")).toHaveCount(2);
});

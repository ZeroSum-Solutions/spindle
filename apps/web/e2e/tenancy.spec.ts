import { expect, test, type Browser, type Page } from "@playwright/test";
import { authCookiesSet, forceExpiresAt, jwtClaims, readSession, sha256 } from "./helpers/auth-cookie";
import { cleanupRun, lit, sql } from "./helpers/local-supabase";

// Traces would record sign-in codes, cookie values and the service key's headers.
test.use({ trace: "off" });

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
const run = Date.now().toString(36);
const alice = `alice-${run}@a.test`;
const tess = `tess-${run}@a.test`;
const bob = `bob-${run}@b.test`;
const gymA = `gym-a-${run}`;
const rita = `rita-${run}@a.test`;
const gymR = `gym-r-${run}`;
const carols = [0, 1, 2].map((i) => `carol-${run}-${i}@c.test`);

// Every account and gym this run creates, removed by exact address and slug.
test.afterAll(async () => {
  test.setTimeout(60_000);
  await cleanupRun({ emails: [alice, tess, bob, rita, ...carols], slugs: [gymA, gymR], objects: "false" });
});

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

async function signIn(browser: Browser, email: string, next = "/gyms", expected = next): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel("6-digit code").fill(await latestCode(email));
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`**${expected}`);
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
  // The token never enters the address bar, and a reload does not show it again.
  expect(a.url()).not.toContain(link.slice(8));
  await a.reload();
  await expect(a.getByTestId("invite-link")).toHaveCount(0);
  await expect(a.getByText(tess)).toBeVisible(); // listed under pending invites

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

  // Alice now sees two members, and Tess's invite is no longer pending.
  await a.reload();
  await expect(a.locator("section li")).toHaveCount(2);
});

test("sign-in never redirects off-site", async ({ browser }) => {
  const attempts = ["//evil.example", "/\\evil.example", "https://evil.example"];
  for (const [i, next] of attempts.entries()) {
    const page = await signIn(browser, carols[i]!, next, "/gyms");
    expect(new URL(page.url()).host).toBe(`127.0.0.1:${process.env.E2E_PORT ?? "3100"}`);
  }
});

test.describe("an expiring session", () => {
  test("refreshes in the proxy, rotates the refresh token and stays signed in", async ({ browser }) => {
    const page = await signIn(browser, rita);
    await page.getByLabel("Gym name").fill("Gym R");
    await page.getByLabel(/Web address/).fill(gymR);
    await page.getByRole("button", { name: "Create gym" }).click();
    await expect(page.getByRole("heading", { name: "Gym R" })).toBeVisible();

    const context = page.context();
    // Control: an unexpired session is not refreshed.
    const control = await page.goto("/gyms");
    const controlCookies = (await control!.headersArray()).filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value);
    expect(authCookiesSet(controlCookies)).toEqual([]);
    const before = (await readSession(context)).session;
    const old = jwtClaims(before.access_token);
    // A refresh in the same second as sign-in could mint an identical JWT; wait past it.
    while (Date.now() / 1000 < old.iat + 1.5) await page.waitForTimeout(250);

    // Forced refresh of real tokens: only the cookie's expires_at moves into the
    // past. The access token itself is still validly signed and unexpired, so
    // this exercises the refresh path, not a server rejecting an expired JWT.
    await forceExpiresAt(context, Math.floor(Date.now() / 1000) - 1);
    const refreshed = page.waitForResponse((r) => r.request().resourceType() === "document" && new URL(r.url()).pathname === "/gyms");
    await page.goto("/gyms");
    const response = await refreshed;
    const setCookie = (await response.headersArray()).filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value);
    expect(authCookiesSet(setCookie).length, "the proxy sets a refreshed auth cookie").toBeGreaterThan(0);

    const after = (await readSession(context)).session;
    const now = jwtClaims(after.access_token);
    expect(sha256(after.access_token)).not.toBe(sha256(before.access_token));
    expect(sha256(after.refresh_token)).not.toBe(sha256(before.refresh_token));
    expect(now.sub).toBe(old.sub);
    expect(now.session_id).toBe(old.session_id);
    expect(now.iat).toBeGreaterThan(old.iat);
    expect(after.expires_at).toBeGreaterThan(Date.now() / 1000 + 30 * 60);

    // Server evidence: Auth revoked the old refresh token and issued its child.
    const rows = sql(`select encode(sha256(convert_to(token, 'UTF8')), 'hex'), revoked,
        coalesce(encode(sha256(convert_to(parent, 'UTF8')), 'hex'), '')
      from auth.refresh_tokens where session_id = ${lit(old.session_id)} order by id`);
    const byHash = new Map(rows.map(([hash, revoked, parent]) => [hash, { revoked, parent }]));
    expect(byHash.get(sha256(before.refresh_token))?.revoked).toBe("t");
    expect(byHash.get(sha256(after.refresh_token))).toEqual({ revoked: "f", parent: sha256(before.refresh_token) });

    // Same person, same gym, and the new cookie persists: no further refresh.
    await expect(page.getByRole("link", { name: /Gym R/ })).toBeVisible();
    const reloaded = await page.reload();
    const again = (await reloaded!.headersArray()).filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value);
    expect(authCookiesSet(again)).toEqual([]);
    expect(sha256((await readSession(context)).session.refresh_token)).toBe(sha256(after.refresh_token));
    await page.goto(`/gyms/${gymR}`);
    await expect(page.getByRole("heading", { name: "Gym R" })).toBeVisible();
    await expect(page.getByText("owner").first()).toBeVisible();
  });
});

import type { Browser, Page } from "@playwright/test";
import { codeAfter, messageIds, type Actor } from "../player-fixtures";

/** Signs an actor in through the real email-code flow in a fresh browser context, landing on `next`. */
export async function signIn(browser: Browser, who: Actor, next: string, viewport = { width: 1280, height: 800 }): Promise<Page> {
  const page = await (await browser.newContext({ viewport })).newPage();
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

export const learnPath = (gym: { slug: string }, assignment?: string, rest?: string) =>
  `/gyms/${gym.slug}/learn${assignment ? `/${assignment}` : ""}${rest ? `/${rest}` : ""}`;

import { expect, test, type Page } from "@playwright/test";

// The signed-out page for coaches and gyms. Static: no database rows are written.

const HEADING = "Teach your method on a base that cites its science.";

async function expectCoaches(page: Page) {
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(HEADING);
  await expect(page.getByRole("main").getByRole("link", { name: "Sign in" }).first()).toHaveAttribute("href", "/sign-in?next=%2Fgyms");
  // Teaching text is labelled in words; the method layer is practice-based.
  await expect(page.getByText("Practice-based", { exact: true }).first()).toBeVisible();
  // Every future capability says so in words.
  const planned = page.locator("[data-capability]");
  await expect(planned).not.toHaveCount(0);
  for (const item of await planned.all()) await expect(item.getByText("Planned", { exact: true })).toBeVisible();
  // Ten modalities, each marked.
  await expect(page.locator("[data-modality]")).toHaveCount(10);
  for (const item of await page.locator("[data-modality]").all()) await expect(item).toContainText(/Planned|In development/);
  // Two theme swatches rendered by the validator, each passing every check.
  const swatches = page.locator("[data-theme-swatch]");
  await expect(swatches).toHaveCount(2);
  for (const s of await swatches.all()) await expect(s).toContainText(/(\d+) of \1 contrast checks pass/);
}

test.describe("coaches page", () => {
  test("is a signed-out page with a sign-in action, honest markers and no sideways scroll", async ({ page }) => {
    const dir = process.env.PLAYER_CAPTURE_DIR;
    for (const [width, height, label] of [[1440, 900, "desktop"], [390, 844, "mobile"], [320, 700, "narrow"]] as const) {
      await page.setViewportSize({ width, height });
      const res = await page.goto("/coaches");
      expect(res?.status()).toBe(200);
      await page.waitForLoadState("networkidle");
      await expectCoaches(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `/coaches at ${width}px scrolls sideways`).toBe(0);
      if (dir) await page.screenshot({ path: `${dir}/${label}-coaches.png`, fullPage: true });
    }
  });

  test("every link and control is reachable by keyboard with a visible focus ring", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/coaches");
    const focusable = await page.locator("a[href], button").count();
    const seen = new Set<string>();
    for (let i = 0; i < focusable + 2; i++) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const style = getComputedStyle(el);
        return { key: `${el.tagName}:${el.getAttribute("href") ?? el.textContent}`, outline: style.outlineStyle };
      });
      if (!info) continue;
      expect(info.outline, info.key).toBe("solid");
      seen.add(info.key);
    }
    expect([...seen].some((k) => k.includes("/sign-in"))).toBe(true);
  });

  test("the landing page links to it from the header and the footer", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("banner").getByRole("link", { name: "For coaches" })).toHaveAttribute("href", "/coaches");
    await page.getByRole("contentinfo").getByRole("link", { name: "For coaches" }).click();
    await expect(page).toHaveURL(/\/coaches$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(HEADING);
  });
});

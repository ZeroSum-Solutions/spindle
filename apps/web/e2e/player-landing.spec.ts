import { expect, test, type Page } from "@playwright/test";

// The signed-out home page. No database rows are written; the page is static.

const HEADING = "Your method, on a base that shows its work.";

/** The landing page itself, not an error page that happens to fit the viewport. */
async function expectLanding(page: Page) {
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(HEADING);
  await expect(page.getByRole("main").getByRole("link", { name: "Sign in" }).first()).toHaveAttribute("href", "/sign-in?next=%2Fgyms");
  // Teaching text is labelled in words, never by colour alone.
  await expect(page.getByText("Science", { exact: true })).toBeVisible();
  await expect(page.getByText("Practice-based", { exact: true })).toBeVisible();
  await expect(page.getByText("Authoring planned")).toBeVisible();
}

test.describe("signed-out landing", () => {
  test("home is a landing page with a sign-in action and no sideways scroll", async ({ page }) => {
    const dir = process.env.PLAYER_CAPTURE_DIR;
    for (const [width, height, label] of [[1440, 900, "desktop"], [390, 844, "mobile"], [320, 700, "narrow"]] as const) {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      await expectLanding(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `landing at ${width}px scrolls sideways`).toBe(0);
      if (dir) await page.screenshot({ path: `${dir}/${label}-landing.png`, fullPage: true });
    }

    // Focus appears immediately, in the right colour: read the ring with no wait after Tab.
    await page.setViewportSize({ width: 1440, height: 900 });
    const ringAfterTab = async (selector: string) => {
      const link = page.locator(selector).first();
      await link.focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      return link.evaluate((el) => [document.activeElement === el, getComputedStyle(el).outlineColor, getComputedStyle(el).outlineStyle]);
    };
    expect(await ringAfterTab('header a:has-text("Sign in")')).toEqual([true, "rgb(36, 83, 212)", "solid"]);
    expect(await ringAfterTab('section[aria-labelledby="closing-title"] a')).toEqual([true, "rgb(255, 255, 255)", "solid"]);

    await page.getByRole("main").getByRole("link", { name: "Sign in" }).first().click();
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fgyms$/);
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  });
});

import { expect, test } from "@playwright/test";

// The signed-out home page. No database rows are written; the page is static.

test.describe("signed-out landing", () => {
  test("home is a landing page with a sign-in action and no sideways scroll", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your method, on a base that shows its work.");
    const cta = page.getByRole("main").getByRole("link", { name: "Sign in" }).first();
    await expect(cta).toHaveAttribute("href", "/sign-in?next=%2Fgyms");
    // Every block shown on the page is labelled in words, never by colour alone.
    await expect(page.getByText("Science", { exact: true })).toBeVisible();
    await expect(page.getByText("Practice-based", { exact: true })).toBeVisible();

    const dir = process.env.PLAYER_CAPTURE_DIR;
    for (const [width, height, label] of [[1440, 900, "desktop"], [390, 844, "mobile"], [320, 700, "narrow"]] as const) {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `landing at ${width}px scrolls sideways`).toBe(0);
      if (dir) await page.screenshot({ path: `${dir}/${label}-landing.png`, fullPage: true });
    }

    await cta.click();
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fgyms$/);
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  });
});

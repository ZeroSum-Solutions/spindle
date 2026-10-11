import { expect, test, type Page } from "@playwright/test";

// The app header on a page that needs no data: /sign-in. No database rows are written.

/** The ring is 3px wide and offset 4px, so it reaches 7px beyond the focused box. */
const RING_REACH = 7;

async function focusFirst(page: Page) {
  await page.keyboard.press("Tab");
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const r = el.getBoundingClientRect();
    return { label: el.getAttribute("aria-label") ?? el.textContent ?? "", top: r.top, left: r.left, bottom: r.bottom };
  });
}

test.describe("app header", () => {
  for (const [width, height] of [[1440, 900], [390, 844], [320, 700]] as const) {
    test(`the first focus ring is fully inside the window at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/sign-in");
      await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
      const focused = await focusFirst(page);
      expect(focused.label).toContain("Spindle");
      expect(focused.top - RING_REACH, "ring clipped at the top edge").toBeGreaterThanOrEqual(0);
      expect(focused.left - RING_REACH, "ring clipped at the left edge").toBeGreaterThanOrEqual(0);
    });
  }

  test("the wordmark lines up with the page's content column", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/sign-in");
    const heading = page.getByRole("heading", { level: 1, name: "Sign in" });
    await expect(heading).toBeVisible();
    const mark = await page.locator("header img:visible").first().boundingBox();
    const content = await heading.boundingBox();
    expect(Math.abs(mark!.x - content!.x), `wordmark at ${mark!.x}, content at ${content!.x}`).toBeLessThanOrEqual(1);
  });
});

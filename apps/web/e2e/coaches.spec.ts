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
  for (const s of await swatches.all()) await expect(s).toContainText(/(\d+) of \1 checks pass in light and dark/);
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

  test("every visible link and control is reached by Tab, one by one, with a real focus ring", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/coaches");
    // Tag every visible focusable element, so each is tracked on its own even when two share a URL.
    const total = await page.evaluate(() => {
      const els = [...document.querySelectorAll<HTMLElement>("a[href], button, summary, [tabindex]:not([tabindex='-1'])")].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
      });
      els.forEach((el, i) => el.setAttribute("data-tab-id", String(i)));
      return els.length;
    });
    expect(total).toBeGreaterThan(3);
    const seen = new Set<string>();
    for (let i = 0; i < total + 3 && seen.size < total; i++) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const style = getComputedStyle(el);
        const onInk = Boolean(el.closest('section[aria-labelledby="coaches-closing-title"]'));
        return { id: el.getAttribute("data-tab-id"), name: el.textContent?.trim().slice(0, 40), style: style.outlineStyle, width: parseFloat(style.outlineWidth), color: style.outlineColor, onInk };
      });
      if (!info?.id) continue;
      expect(info.style, info.name).toBe("solid");
      expect(info.width, info.name).toBeGreaterThanOrEqual(3);
      // Cobalt on light surfaces; white on the closing ink band (DESIGN.md › Accessibility).
      expect(info.color, info.name).toBe(info.onInk ? "rgb(255, 255, 255)" : "rgb(200, 25, 95)");
      seen.add(info.id);
    }
    expect(seen.size, "every visible focusable element is reached by Tab").toBe(total);
  });

  test("the landing page links to it from the header and the footer", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("banner").getByRole("link", { name: "For coaches" })).toHaveAttribute("href", "/coaches");
    await page.getByRole("contentinfo").getByRole("link", { name: "For coaches" }).click();
    await expect(page).toHaveURL(/\/coaches$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(HEADING);
  });
});

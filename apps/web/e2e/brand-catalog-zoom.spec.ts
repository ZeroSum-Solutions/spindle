import { expect, test } from "@playwright/test";
import { SCENES, axeClean, keyboardPath, noOverflow, open } from "./helpers/catalog";

// 200% browser zoom of a 1280px window for the P4-A2 catalog scenes. Headless Chromium has no zoom
// control, so the "chromium-zoom-200" project (playwright.config.ts) opens the window that zoom
// produces: 640 CSS px at devicePixelRatio 2, from real window flags rather than viewport emulation.
test.describe("P4-A2 brand components at 200% zoom of a 1280px window (window-level, no viewport emulation)", () => {
  test("the zoomed window is in effect, scenes pass axe, nothing overflows, and the keyboard path holds", async ({ page }) => {
    await open(page);
    const metrics = await page.evaluate(() => ({ dpr: window.devicePixelRatio, width: window.innerWidth }));
    expect(metrics.dpr).toBe(2);
    expect(metrics.width).toBe(640);
    for (const s of SCENES) await axeClean(page, s.id, "200% zoom");
    await noOverflow(page, "200% zoom");
    for (const s of SCENES) await keyboardPath(page, s.id, s.colors, "200% zoom");
  });
});

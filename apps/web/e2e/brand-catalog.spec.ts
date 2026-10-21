import { expect, test } from "@playwright/test";
import { ATLAS_FIXED, PILATES, SCENES, VIEWS, axeClean, keyboardPath, noOverflow, open, rgb, scene } from "./helpers/catalog";

// P4-A2 member catalog components on the test-only /brand-preview page: two synthetic brands, a
// pending scene (every held text pending, so the fixed fallbacks show) and a 60-character name.
// Presentational only: no database, no sign-in.

test.describe("P4-A2 brand components", () => {
  for (const view of VIEWS) {
    test.describe(`at ${view.label}`, () => {
      test.use({ viewport: { width: view.width, height: view.height }, deviceScaleFactor: view.scale });

      test("every scene passes axe AA in default, hover and focus states, and nothing overflows or is clipped", async ({ page }) => {
        await open(page);
        for (const s of SCENES) {
          await axeClean(page, s.id, `default at ${view.label}`);
          const card = scene(page, s.id).locator("a[data-course-card]").first();
          await card.hover();
          await axeClean(page, s.id, `card hover at ${view.label}`);
          await scene(page, s.id).locator("header a").first().focus();
          await axeClean(page, s.id, `header link focus at ${view.label}`);
          await card.focus();
          await axeClean(page, s.id, `card focus at ${view.label}`);
        }
        await noOverflow(page, view.label);
      });

      test("keyboard path through every scene, with visible, unclipped rings", async ({ page }) => {
        await open(page);
        for (const s of SCENES) await keyboardPath(page, s.id, s.colors, view.label);
      });
    });
  }

  test("every computed colour is the brand's own (brandTokens) or a fixed Atlas colour, in default, hover and focus states", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page);
    for (const s of SCENES) {
      const allowed = new Set([...Object.values(s.colors), ...ATLAS_FIXED].map(rgb));
      const root = scene(page, s.id);
      const card = root.locator("a[data-course-card]").first();
      const states: [string, () => Promise<void>][] = [
        ["default", async () => {}],
        ["card hover", () => card.hover()],
        ["header link focus", () => root.locator("header a").first().focus()],
        ["action focus", () => root.locator("[data-catalog-action]").focus()],
        ["card focus", () => card.focus()],
      ];
      for (const [state, enter] of states) {
        await enter();
        // Colour transitions (120ms) must finish, so only final colours are measured.
        await page.evaluate(() => Promise.all(document.getAnimations().map((x) => x.finished)));
        const seen = await root.evaluate((el0) => {
          const out: string[] = [];
          for (const el of [el0, ...el0.querySelectorAll("*")]) {
            // Pattern covers and the Spindle symbol are exempt (decorative; DESIGN.md › Colors).
            if (el.closest("svg[data-pattern]") || el.tagName === "IMG") continue;
            const cs = getComputedStyle(el);
            const add = (v: string) => {
              if (!/rgba\(0, 0, 0, 0\)|transparent/.test(v)) out.push(v);
            };
            add(cs.color);
            add(cs.backgroundColor);
            if (parseFloat(cs.borderTopWidth) > 0) add(cs.borderTopColor);
            if (parseFloat(cs.borderLeftWidth) > 0) add(cs.borderLeftColor);
            if (cs.outlineStyle !== "none") add(cs.outlineColor);
            if (cs.textDecorationLine !== "none") add(cs.textDecorationColor);
          }
          return [...new Set(out)];
        });
        expect(seen.filter((c) => !allowed.has(c)), `${s.id}: colours outside the allowed set, ${state}`).toEqual([]);
      }
    }
  });

  test("the header and hero use the band colours, and the 60-character name wraps inside the header", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await open(page);
    for (const s of SCENES) {
      const header = scene(page, s.id).locator("header");
      await expect(header).toHaveCSS("background-color", rgb(s.colors.band));
      await expect(header).toHaveCSS("position", "static");
      await expect(header.locator("[data-brand-name]")).toHaveCSS("color", rgb(s.colors.onBand));
    }
    const long = scene(page, "long-name").locator("header");
    const [h, n] = await Promise.all([long.boundingBox(), long.locator("[data-brand-name]").boundingBox()]);
    expect(n!.x + n!.width).toBeLessThanOrEqual(h!.x + h!.width + 0.5);
  });

  test("the pending scene shows the fixed fallbacks and omits pending text", async ({ page }) => {
    await open(page);
    const p = scene(page, "pending");
    await expect(p.locator("header [data-brand-name]")).toHaveText("Your gym");
    await expect(p.locator("[data-hero-headline]")).toHaveText("Your gym");
    await expect(p.locator("[data-hero-tagline]")).toHaveCount(0);
    await expect(p.locator("[data-course-card] [data-course-title]").first()).toHaveText("Untitled course");
    await expect(p.locator("[data-coach-note]")).toHaveCount(0);
  });

  test("sections: the seal heads Base only; Modality is its own section; card titles sit one level below their section", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page);
    const s = scene(page, "strength");
    const base = s.locator('[data-catalog-section="base"]');
    const modality = s.locator('[data-catalog-section="modality"]');
    await expect(base.locator("> div [data-base-seal]")).toHaveCount(1);
    await expect(base.locator("[data-course-card]")).toHaveCount(await base.locator('[data-course-card][data-layer="base"]').count());
    await expect(modality.locator("[data-course-card]")).toHaveCount(await modality.locator('[data-course-card][data-layer="modality"]').count());
    await expect(modality.locator("[data-base-seal]")).toHaveCount(0);
    await expect(modality.locator('[data-course-card][data-layer="modality"]').first()).toContainText("Published by Spindle");
    for (const section of await s.locator("[data-catalog-section]").all()) {
      await expect(section.locator("> h3, > div > h3")).toHaveCount(1);
      for (const card of await section.locator("[data-course-card]").all()) await expect(card.locator("h4")).toHaveCount(1);
    }
  });

  test("cards: one link each, hover edge in control grey; a method course without a cover draws diagonal in the accent", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page);
    const s = scene(page, "strength");
    for (const card of await s.locator("[data-course-card]").all()) await expect(card.locator("a")).toHaveCount(0);
    const method = s.locator('[data-course-card][data-layer="method"]').first();
    await method.hover();
    await expect(method).toHaveCSS("border-top-color", "rgb(115, 122, 137)");
    const bare = scene(page, "pilates").locator("[data-course-card]", { hasText: "Mat class structure" });
    await expect(bare.locator("svg[data-pattern]")).toHaveAttribute("data-pattern", "diagonal");
    await expect(bare.locator("svg[data-pattern] rect")).toHaveCSS("fill", rgb(PILATES.accent));
  });

  test("the coach note sits on surface with the practice rule, label and caption", async ({ page }) => {
    await open(page);
    const note = scene(page, "strength").locator("[data-coach-note]");
    await expect(note).toContainText("Note from Coach A. Example");
    await expect(note).toContainText("Practice-based");
    await expect(note).toContainText("Coach's note. Based on coaching practice, not a research claim.");
    await expect(note).toHaveCSS("border-left-color", "rgb(138, 75, 16)");
  });
});

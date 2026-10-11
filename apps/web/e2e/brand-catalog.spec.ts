import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

// P4-A2 member catalog components on the test-only /brand-preview page: two synthetic brands, a
// pending scene (every held text pending, so the fixed fallbacks show) and a 60-character name.
// Presentational only: no database, no sign-in.

const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
const SCENES = [
  { id: "strength", accent: "#7a1b26", onBand: "#ffffff", band: "#17232b" },
  { id: "pilates", accent: "#2f6b57", onBand: "#17232b", band: "#e8efe6" },
  { id: "pending", accent: "#7a1b26", onBand: "#ffffff", band: "#17232b" },
  { id: "long-name", accent: "#2f6b57", onBand: "#17232b", band: "#e8efe6" },
] as const;

const VIEWS = [
  { label: "320", width: 320, height: 800, scale: 1 },
  { label: "390", width: 390, height: 844, scale: 1 },
  { label: "1440", width: 1440, height: 900, scale: 1 },
  // A real 200% zoom of a 1280px window: 640 CSS px at device scale 2.
  { label: "1280 at 200%", width: 640, height: 400, scale: 2 },
] as const;

const scene = (page: Page, id: string) => page.locator(`[data-catalog-preview="${id}"]`);

function lum(c: string) {
  const [r, g, b] = (c.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number).map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

/** Opens the preview and waits until the streamed scenes are revealed (the page renders behind Suspense). */
async function open(page: Page) {
  await page.goto("/brand-preview");
  for (const s of SCENES) await expect(scene(page, s.id)).toBeVisible();
}

async function scrollX(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe("P4-A2 brand components", () => {
  for (const view of VIEWS) {
    test.describe(`at ${view.label}`, () => {
      test.use({ viewport: { width: view.width, height: view.height }, deviceScaleFactor: view.scale });

      test("every scene passes axe AA and reflows without sideways scroll", async ({ page }) => {
        await open(page);
        for (const s of SCENES) {
          await expect(scene(page, s.id)).toBeVisible();
          const axe = await new AxeBuilder({ page }).include(`[data-catalog-preview="${s.id}"]`).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
          expect(axe.violations.map((v) => `${v.id}: ${v.nodes.length}`), `${s.id} at ${view.label}`).toEqual([]);
        }
        expect(await scrollX(page), `sideways scroll at ${view.label}`).toBe(0);
        // Nothing in a scene is wider than the scene (no clipped header, hero or card).
        for (const s of SCENES) {
          const overflow = await scene(page, s.id).evaluate((el) => [...el.querySelectorAll("*")].filter((c) => c.scrollWidth > c.clientWidth + 1 && getComputedStyle(c).overflowX === "visible" && c.clientWidth > 0).length);
          expect(overflow, `${s.id}: overflowing elements at ${view.label}`).toBe(0);
        }
      });
    });
  }

  test("the header and hero use the band colours, and the 60-character name wraps inside the header", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await open(page);
    for (const s of SCENES) {
      const header = scene(page, s.id).locator("header");
      await expect(header).toHaveCSS("background-color", rgb(s.band));
      await expect(header).toHaveCSS("position", "static");
      const name = header.locator("[data-brand-name]");
      await expect(name).toHaveCSS("color", rgb(s.onBand));
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

  for (const width of [1440, 390]) {
    test(`keyboard path at ${width}: header links, the ink action, then one stop per card, each with a visible ring`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page);
      for (const s of SCENES.filter((x) => x.id !== "long-name")) {
        const root = scene(page, s.id);
        const expected: Locator[] = [
          ...(await root.locator("header a").all()),
          root.locator("[data-catalog-action]"),
          ...(await root.locator("a[data-course-card]").all()),
        ];
        expect(expected.length).toBeGreaterThan(3);
        await expected[0]!.focus();
        for (const [i, target] of expected.entries()) {
          if (i > 0) await page.keyboard.press("Tab");
          await expect(target, `${s.id}: stop ${i + 1}`).toBeFocused();
          const ring = await target.evaluate((el) => {
            const cs = getComputedStyle(el);
            let bg = "rgba(0, 0, 0, 0)";
            for (let p = el.parentElement; p && /rgba\(0, 0, 0, 0\)|transparent/.test(bg); p = p.parentElement) bg = getComputedStyle(p).backgroundColor;
            return { color: cs.outlineColor, width: cs.outlineWidth, style: cs.outlineStyle, offset: cs.outlineOffset, bg };
          });
          expect(ring.style, `${s.id}: stop ${i + 1} ring`).toBe("solid");
          expect(ring.width).toBe("3px");
          expect(ring.offset).toBe("4px");
          const inHeader = await target.evaluate((el) => !!el.closest("header"));
          expect(ring.color, `${s.id}: stop ${i + 1} ring colour`).toBe(rgb(inHeader ? s.onBand : s.accent));
          expect(ratio(ring.color, ring.bg), `${s.id}: stop ${i + 1} ring contrast`).toBeGreaterThanOrEqual(3);
        }
      }
    });
  }

  test("cards: one link each, hover edge in control grey, Base cards carry the seal, Modality cards say Published by Spindle", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page);
    const s = scene(page, "strength");
    for (const card of await s.locator("[data-course-card]").all()) await expect(card.locator("a")).toHaveCount(0);
    const base = s.locator('[data-course-card][data-layer="base"]').first();
    await expect(base).toContainText("Base curriculum by Spindle, cited");
    await expect(s.locator('[data-course-card][data-layer="modality"]').first()).toContainText("Published by Spindle");
    const method = s.locator('[data-course-card][data-layer="method"]').first();
    await method.hover();
    await expect(method).toHaveCSS("border-top-color", "rgb(117, 132, 145)");
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

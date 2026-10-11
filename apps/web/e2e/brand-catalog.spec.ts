import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { brandTokens } from "@spindle/engine";

// P4-A2 member catalog components on the test-only /brand-preview page: two synthetic brands, a
// pending scene (every held text pending, so the fixed fallbacks show) and a 60-character name.
// Presentational only: no database, no sign-in.

const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
const STRENGTH = brandTokens({ accent: "#7a1b26", onAccent: "#ffffff", band: "#17232b" });
const PILATES = brandTokens({ accent: "#2f6b57", onAccent: "#ffffff", band: "#e8efe6" });
const SCENES = [
  { id: "strength", colors: STRENGTH },
  { id: "pilates", colors: PILATES },
  { id: "pending", colors: STRENGTH },
  { id: "long-name", colors: PILATES },
] as const;

/** Fixed Atlas colours any scene may draw (DESIGN.md › Colors); the brand's own come from brandTokens. */
const ATLAS_FIXED = ["#f6f8fb", "#ffffff", "#edf1f5", "#17232b", "#52616d", "#2c3c47", "#d8e0e7", "#758491", "#0b6b50", "#eaf5f0", "#8a4b10", "#fff3e6"];

const VIEWS = [
  { label: "320", width: 320, height: 800, scale: 1 },
  { label: "390", width: 390, height: 844, scale: 1 },
  { label: "1440", width: 1440, height: 900, scale: 1 },
  // Reflow emulation of 200% zoom at 1280: 640 CSS px at device scale 2. Real browser zoom is tested below.
  { label: "640 at scale 2", width: 640, height: 400, scale: 2 },
] as const;

const scene = (page: Page, id: string) => page.locator(`[data-catalog-preview="${id}"]`);

/** Opens the preview and waits until the streamed scenes are revealed (the page renders behind Suspense). */
async function open(page: Page) {
  await page.goto("/brand-preview");
  for (const s of SCENES) await expect(scene(page, s.id)).toBeVisible();
}

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

async function axeClean(page: Page, id: string, what: string) {
  const axe = await new AxeBuilder({ page }).include(`[data-catalog-preview="${id}"]`).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.length}`), `${id}: ${what}`).toEqual([]);
}

/** No sideways scroll, and nothing in a scene is wider than its box, whether it overflows visibly or is clipped. */
async function noOverflow(page: Page, what: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `sideways scroll, ${what}`).toBe(0);
  for (const s of SCENES) {
    const wide = await scene(page, s.id).evaluate((root) =>
      [root, ...root.querySelectorAll("*")]
        .filter((el) => !(el instanceof SVGElement) && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1)
        .map((el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""} ${el.scrollWidth}>${el.clientWidth}`),
    );
    expect(wide, `${s.id}: overflowing or clipped content, ${what}`).toEqual([]);
  }
}

/** Every Tab stop in a scene, in order: header links, the ink action, then one stop per card. */
async function tabStops(root: Locator): Promise<Locator[]> {
  return [...(await root.locator("header a").all()), root.locator("[data-catalog-action]"), ...(await root.locator("a[data-course-card]").all())];
}

/** Walks the scene's keyboard path and checks each ring: colour, size, contrast, and not clipped by any ancestor. */
async function keyboardPath(page: Page, id: string, colors: ReturnType<typeof brandTokens>, what: string) {
  const root = scene(page, id);
  const stops = await tabStops(root);
  expect(stops.length, `${id}: stops`).toBeGreaterThanOrEqual(3);
  await stops[0]!.focus();
  for (const [i, target] of stops.entries()) {
    if (i > 0) await page.keyboard.press("Tab");
    await expect(target, `${id}: stop ${i + 1}, ${what}`).toBeFocused();
    const ring = await target.evaluate((el) => {
      const cs = getComputedStyle(el);
      let bg = "rgba(0, 0, 0, 0)";
      for (let p = el.parentElement; p && /rgba\(0, 0, 0, 0\)|transparent/.test(bg); p = p.parentElement) bg = getComputedStyle(p).backgroundColor;
      // The ring extends outline-offset + outline-width beyond the box; no clipping ancestor may cut it.
      const reach = parseFloat(cs.outlineOffset) + parseFloat(cs.outlineWidth);
      const r = el.getBoundingClientRect();
      const clipped: string[] = [];
      for (let p = el.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p);
        if (o.overflowX === "visible" && o.overflowY === "visible") continue;
        const c = p.getBoundingClientRect();
        if (r.left - reach < c.left - 0.5 || r.right + reach > c.right + 0.5 || r.top - reach < c.top - 0.5 || r.bottom + reach > c.bottom + 0.5) clipped.push(p.tagName);
      }
      return { color: cs.outlineColor, width: cs.outlineWidth, style: cs.outlineStyle, offset: cs.outlineOffset, bg, clipped, inHeader: !!el.closest("header") };
    });
    expect(ring.style, `${id}: stop ${i + 1} ring, ${what}`).toBe("solid");
    expect(ring.width).toBe("3px");
    expect(ring.offset).toBe("4px");
    expect(ring.color, `${id}: stop ${i + 1} ring colour, ${what}`).toBe(rgb(ring.inHeader ? colors.onBand : colors.accent));
    expect(ratio(ring.color, ring.bg), `${id}: stop ${i + 1} ring contrast, ${what}`).toBeGreaterThanOrEqual(3);
    expect(ring.clipped, `${id}: stop ${i + 1} ring clipped, ${what}`).toEqual([]);
  }
}

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

  test("every computed colour is the brand's own (brandTokens) or a fixed Atlas colour", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page);
    for (const s of SCENES) {
      const allowed = new Set([...Object.values(s.colors), ...ATLAS_FIXED].map(rgb));
      const seen = await scene(page, s.id).evaluate((root) => {
        const out: string[] = [];
        for (const el of [root, ...root.querySelectorAll("*")]) {
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
      expect(seen.filter((c) => !allowed.has(c)), `${s.id}: colours outside the allowed set`).toEqual([]);
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
    await expect(method).toHaveCSS("border-top-color", "rgb(117, 132, 145)");
    const bare = scene(page, "pilates").locator("[data-course-card]", { hasText: "Mat class structure" });
    await expect(bare.locator("svg[data-pattern]")).toHaveAttribute("data-pattern", "diagonal");
    await expect(bare.locator("svg[data-pattern] rect")).toHaveAttribute("fill", PILATES.accent);
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

test.describe("P4-A2 brand components at real 200% browser zoom (1280px window)", () => {
  // Chromium's device scale factor at the window level is how browser zoom reaches the page:
  // a 1280px window at 200% lays out 640 CSS px with devicePixelRatio 2.
  test.use({ viewport: null, launchOptions: { args: ["--window-size=1280,900", "--force-device-scale-factor=2"] } });

  test("zoom is applied, scenes pass axe, nothing overflows, and the keyboard path holds", async ({ page }) => {
    await open(page);
    const metrics = await page.evaluate(() => ({ dpr: window.devicePixelRatio, width: window.innerWidth }));
    expect(metrics.dpr).toBe(2);
    expect(metrics.width).toBeLessThanOrEqual(640);
    for (const s of SCENES) await axeClean(page, s.id, "200% zoom");
    await noOverflow(page, "200% zoom");
    for (const s of SCENES) await keyboardPath(page, s.id, s.colors, "200% zoom");
  });
});

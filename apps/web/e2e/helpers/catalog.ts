import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page } from "@playwright/test";
import { brandTokens } from "@spindle/engine";

// Shared by the P4-A2 catalog specs (default views and real browser zoom).

export const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
export const STRENGTH = brandTokens({ accent: "#7a1b26", onAccent: "#ffffff", band: "#17232b" });
export const PILATES = brandTokens({ accent: "#2f6b57", onAccent: "#ffffff", band: "#e8efe6" });
export const SCENES = [
  { id: "strength", colors: STRENGTH },
  { id: "pilates", colors: PILATES },
  { id: "pending", colors: STRENGTH },
  { id: "long-name", colors: PILATES },
] as const;

/** Fixed Atlas colours any scene may draw (DESIGN.md › Colors); the brand's own come from brandTokens. */
export const ATLAS_FIXED = ["#f6f8fb", "#ffffff", "#edf1f5", "#17232b", "#52616d", "#2c3c47", "#d8e0e7", "#758491", "#0b6b50", "#eaf5f0", "#8a4b10", "#fff3e6"];

export const VIEWS = [
  { label: "320", width: 320, height: 800, scale: 1 },
  { label: "390", width: 390, height: 844, scale: 1 },
  { label: "1440", width: 1440, height: 900, scale: 1 },
  // Reflow emulation of 200% zoom at 1280: 640 CSS px at device scale 2. Real browser zoom is tested below.
  { label: "640 at scale 2", width: 640, height: 400, scale: 2 },
] as const;

export const scene = (page: Page, id: string) => page.locator(`[data-catalog-preview="${id}"]`);

/** Opens the preview and waits until the streamed scenes are revealed (the page renders behind Suspense). */
export async function open(page: Page) {
  await page.goto("/brand-preview");
  for (const s of SCENES) await expect(scene(page, s.id)).toBeVisible();
}

export function lum(c: string) {
  const [r, g, b] = (c.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number).map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
export const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

export async function axeClean(page: Page, id: string, what: string) {
  const axe = await new AxeBuilder({ page }).include(`[data-catalog-preview="${id}"]`).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.length}`), `${id}: ${what}`).toEqual([]);
}

/** No sideways scroll, and nothing in a scene is wider than its box, whether it overflows visibly or is clipped. */
export async function noOverflow(page: Page, what: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `sideways scroll, ${what}`).toBe(0);
  for (const s of SCENES) {
    const wide = await scene(page, s.id).evaluate((root) =>
      [root, ...root.querySelectorAll("*")]
        .filter((el) => !(el instanceof SVGElement) && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1)
        .map((el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""} ${el.scrollWidth}>${el.clientWidth}`),
    );
    expect(wide, `${s.id}: overflowing or clipped content, ${what}`).toEqual([]);
    // Vertical clipping: nothing under overflow hidden or clip may be taller than its box (cut-off text).
    const tall = await scene(page, s.id).evaluate((root) =>
      [root, ...root.querySelectorAll("*")]
        .filter((el) => {
          if (el instanceof SVGElement || el.clientHeight === 0) return false;
          const cs = getComputedStyle(el);
          const clips = [cs.overflowY, cs.overflowX].some((o) => o === "hidden" || o === "clip");
          return clips && el.scrollHeight > el.clientHeight + 1;
        })
        .map((el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""} ${el.scrollHeight}>${el.clientHeight}`),
    );
    expect(tall, `${s.id}: vertically clipped content, ${what}`).toEqual([]);
  }
}

/** Every Tab stop in a scene, in order: header links, the ink action, then one stop per card. */
export async function tabStops(root: Locator): Promise<Locator[]> {
  return [...(await root.locator("header a").all()), root.locator("[data-catalog-action]"), ...(await root.locator("a[data-course-card]").all())];
}

/** Walks the scene's keyboard path and checks each ring: colour, size, contrast, and not clipped by any ancestor. */
export async function keyboardPath(page: Page, id: string, colors: ReturnType<typeof brandTokens>, what: string) {
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


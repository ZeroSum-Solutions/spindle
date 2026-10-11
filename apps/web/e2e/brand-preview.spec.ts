import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { brandTokens } from "@spindle/engine";
import { OXBLOOD, SAGE } from "../src/lib/theme/preview-brands";

// Tenant brand theming (P4-A) on the test-only preview page: two synthetic brands render the
// learner shell, a lesson and the module quiz card. No database rows; no sign-in.

const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
const BRANDS = [OXBLOOD, SAGE].map((b) => {
  const t = brandTokens(b.colors);
  return { name: b.name, accent: rgb(t.accent), hover: rgb(t.accentHover), soft: rgb(t.accentSoft), onAccent: rgb(b.colors.onAccent) };
});
// Atlas evidence colours, which no brand can change.
const SCIENCE = "rgb(11, 107, 80)";
const PRACTICE = "rgb(138, 75, 16)";

const VIEWS = [
  { label: "320", width: 320, height: 720, scale: 1 },
  { label: "390", width: 390, height: 844, scale: 1 },
  { label: "1440", width: 1440, height: 900, scale: 1 },
  // 200% browser zoom on a 1440px window: 720 CSS pixels at twice the density.
  { label: "1440 at 200%", width: 720, height: 450, scale: 2 },
] as const;

const section = (page: Page, name: string) => page.locator(`[data-brand-preview="${name}"]`);

/**
 * Puts a brand section into its interactive states: every visible disclosure open (sources, and the
 * course outline on phones) and the self-check answered, so the feedback and selected option render.
 */
async function exercise(s: Locator) {
  for (const summary of await s.locator("details:not([open]) > summary").all()) {
    if (await summary.isVisible()) await summary.click();
  }
  const check = s.locator("form").filter({ has: s.page().getByRole("button", { name: "Check answer" }) }).first();
  await check.getByRole("radio").first().check();
  await check.getByRole("button", { name: "Check answer" }).click();
  await expect(s.getByText("Option B is the synthetic answer.")).toBeVisible();
  await settled(s.page());
}

/** Waits for every finite animation (the feedback fade-in, the chevrons) to finish, so colours are final. */
async function settled(page: Page) {
  await page.evaluate(() =>
    Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished)),
  );
}

async function axeClean(page: Page, name: string, what: string) {
  const axe = await new AxeBuilder({ page }).include(`[data-brand-preview="${name}"]`).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.length}`), `${name}: ${what}`).toEqual([]);
}

/** WCAG contrast of two rgb() strings, computed in the page's terms. */
function ratio(a: string, b: string): number {
  const lum = (rgb: string) => {
    const [r, g, bl] = rgb.match(/\d+(\.\d+)?/g)!.slice(0, 3).map((v) => {
      const s = Number(v) / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/**
 * The element's colour (or outline colour) and the first opaque background behind it. The focus
 * ring is drawn 4px outside the control, so for the ring the search starts at the parent.
 */
async function colours(el: Locator, prop: "color" | "outlineColor" = "color") {
  return el.evaluate((node, p) => {
    let bg = "";
    for (let n: Element | null = p === "outlineColor" ? node.parentElement : node; n; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor;
      if (c && c !== "transparent" && !/rgba\(.*,\s*0\)$/.test(c)) {
        bg = c;
        break;
      }
    }
    return { fg: getComputedStyle(node)[p], bg: bg || "rgb(255, 255, 255)" };
  }, prop);
}

/** Every brand utility the preview uses. A build whose stylesheet lacks one draws that part in Atlas colours. */
const BRAND_UTILITIES = [".bg-brand{", ".border-brand{", ".text-brand{", ".text-on-brand{", ".hover\\:bg-brand-hover:hover{", ".hover\\:text-brand-hover:hover{"];

test.describe("tenant brand preview", () => {
  test("the served stylesheets carry every brand utility the preview uses", async ({ page, request }) => {
    // A guard against a stale or partial CSS build: the selected control once rendered in body text
    // on the accent (1.57:1) in a fresh production run, which only a missing .text-on-brand explains.
    await page.goto("/brand-preview");
    const hrefs = await page.locator('link[rel="stylesheet"]').evaluateAll((els) => els.map((el) => (el as HTMLLinkElement).href));
    expect(hrefs.length).toBeGreaterThan(0);
    const css = (await Promise.all(hrefs.map(async (href) => (await request.get(href)).text()))).join("\n");
    for (const rule of BRAND_UTILITIES) expect(css, `stylesheet rule ${rule}`).toContain(rule);
  });

  for (const view of VIEWS) {
    test(`both brands pass axe AA, reflow without sideways scroll and keep evidence colours at ${view.label}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: view.width, height: view.height }, deviceScaleFactor: view.scale });
      const page = await context.newPage();
      const res = await page.goto("/brand-preview");
      expect(res?.status()).toBe(200);
      await page.waitForLoadState("networkidle");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), "sideways scroll").toBe(0);
      for (const brand of BRANDS) {
        const s = section(page, brand.name);
        await expect(s).toBeVisible();
        await axeClean(page, brand.name, `${view.label}, default state`);
        // Disclosures open, the mobile outline open, the self-check answered: axe again, and no sideways scroll.
        await exercise(s);
        await axeClean(page, brand.name, `${view.label}, opened and answered`);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), "sideways scroll, opened").toBe(0);
        // The current lesson's text sits on the brand tint, which the marker draws in ::before.
        const current = s.locator("[aria-current='page']").filter({ visible: true }).first();
        const marker = await current.evaluate((el) => ({ fg: getComputedStyle(el).color, bg: getComputedStyle(el, "::before").backgroundColor }));
        expect(marker.bg, `${brand.name}: current-lesson tint`).toBe(brand.soft);
        expect(ratio(marker.fg, marker.bg), `${brand.name}: current lesson at ${view.label}`).toBeGreaterThanOrEqual(4.5);
        // The brand drives the mark, links and the current lesson; evidence labels stay Spindle's.
        await expect(s.locator("[data-brand-mark]")).toHaveCSS("color", brand.accent);
        await expect(s.getByText("Science", { exact: true }).first()).toHaveCSS("color", SCIENCE);
        await expect(s.getByText("Practice-based", { exact: true }).first()).toHaveCSS("color", PRACTICE);
        await expect(s.getByText("Base curriculum by Spindle, cited")).toBeVisible();
      }
      await context.close();
    });
  }

  for (const width of [1440, 390]) test(`every themed control shows a visible brand focus ring on keyboard focus, with contrast, at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/brand-preview");
    for (const brand of BRANDS) {
      const s = section(page, brand.name);
      // Open disclosures (sources; the outline on phones) so their contents are Tab stops too.
      await exercise(s);
      const total = await s.evaluate((root) => {
        // A radio group is one Tab stop (arrow keys move inside it), so only its first radio counts.
        const groups = new Set<string>();
        const els = [...root.querySelectorAll<HTMLElement>("a[href], button, summary, input, [tabindex]:not([tabindex='-1'])")].filter((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return false;
          // Disabled controls and content inside a closed disclosure are not Tab stops.
          if ((el as HTMLButtonElement).disabled) return false;
          const details = el.closest("details");
          if (details && !details.open && !el.closest("summary")) return false;
          if (el instanceof HTMLInputElement && el.type === "radio") {
            if (groups.has(el.name)) return false;
            groups.add(el.name);
          }
          return true;
        });
        els.forEach((el, i) => el.setAttribute("data-tab-id", String(i)));
        return els.length;
      });
      expect(total, brand.name).toBeGreaterThan(4);
      // Start just before the section and walk forward with Tab.
      await s.locator("[data-tab-id='0']").focus();
      await page.keyboard.press("Shift+Tab");
      const seen = new Set<string>();
      for (let i = 0; i < total * 3 && seen.size < total; i++) {
        await page.keyboard.press("Tab");
        const focused = s.locator(":focus");
        if ((await focused.count()) === 0) continue;
        const id = await focused.getAttribute("data-tab-id");
        if (id === null || seen.has(id)) continue;
        const style = await focused.evaluate((el) => ({ style: getComputedStyle(el).outlineStyle, width: parseFloat(getComputedStyle(el).outlineWidth), name: (el.textContent ?? el.getAttribute("aria-label") ?? "").trim().slice(0, 40) }));
        expect(style.style, `${brand.name}: ${style.name}`).toBe("solid");
        expect(style.width, `${brand.name}: ${style.name}`).toBeGreaterThanOrEqual(3);
        const { fg, bg } = await colours(focused, "outlineColor");
        expect(fg, `${brand.name}: ring colour on ${style.name}`).toBe(brand.accent);
        expect(ratio(fg, bg), `${brand.name}: ring contrast on ${style.name}`).toBeGreaterThanOrEqual(3);
        seen.add(id);
      }
      expect(seen.size, `${brand.name}: every control reached by Tab`).toBe(total);
    }
  });

  test("hovered links and the selected control keep AA contrast in the rendered page", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/brand-preview");
    for (const brand of BRANDS) {
      const s = section(page, brand.name);
      const link = s.locator("[data-themed='link']").first();
      await link.hover();
      // Wait out the colour transition: assert the final hover colour before measuring.
      await expect(link).toHaveCSS("color", brand.hover);
      const hovered = await colours(link);
      expect(ratio(hovered.fg, hovered.bg), `${brand.name}: hovered link`).toBeGreaterThanOrEqual(4.5);
      expect(hovered.fg).not.toBe(brand.accent);
      const selected = s.locator("[aria-pressed='true']").first();
      // The text is the brand's onAccent colour; if not, the ratio below would only report a symptom.
      await expect(selected, `${brand.name}: selected control text`).toHaveCSS("color", brand.onAccent);
      const sel = await colours(selected);
      expect(ratio(sel.fg, sel.bg), `${brand.name}: selected control`).toBeGreaterThanOrEqual(4.5);
      await selected.hover();
      await expect(selected).toHaveCSS("background-color", brand.hover);
      const selHover = await colours(selected);
      expect(ratio(selHover.fg, selHover.bg), `${brand.name}: selected control, hover`).toBeGreaterThanOrEqual(4.5);
      const current = s.locator("[aria-current='page']").filter({ visible: true }).first();
      const cur = await current.evaluate((el) => ({ fg: getComputedStyle(el).color, bg: getComputedStyle(el, "::before").backgroundColor }));
      expect(cur.bg, `${brand.name}: current-lesson tint`).toBe(brand.soft);
      expect(ratio(cur.fg, cur.bg), `${brand.name}: current lesson`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

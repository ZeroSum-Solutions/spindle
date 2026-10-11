import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";

// Lab Light and Lab Dark (redesign M1). The system setting decides until the reader presses the
// toggle; the choice persists and is on <html> before first paint. Every key route passes axe
// (WCAG 2.2 AA, colour contrast included) in both themes at 320, 390 and 1440px.
// No database rows are written: the routes are signed-out or synthetic.

const CANVAS = { light: "rgb(244, 245, 247)", dark: "rgb(11, 13, 18)" } as const;
const TOGGLE = { name: "Switch light or dark theme" } as const;
const WIDTHS = [
  [320, 700],
  [390, 844],
  [1440, 900],
] as const;

/** Public routes, served in every run; the /design screens exist only on the development server. */
const ROUTES = [
  { path: "/", ready: (p: Page) => expect(p.getByRole("heading", { level: 1 })).toBeVisible() },
  { path: "/coaches", ready: (p: Page) => expect(p.getByRole("heading", { level: 1 })).toBeVisible() },
  { path: "/sign-in", ready: (p: Page) => expect(p.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible() },
  { path: "/brand-preview", ready: (p: Page) => expect(p.locator('[data-catalog-preview="strength"]')).toBeVisible() },
];
const DEV_ROUTES = [
  { path: "/design/screens/lesson", ready: (p: Page) => expect(p.getByRole("heading", { level: 1, name: "Synthetic lesson 2" })).toBeVisible() },
  { path: "/design/screens/quiz", ready: (p: Page) => expect(p.getByRole("heading", { level: 1, name: "Module quiz" })).toBeVisible() },
  { path: "/design/screens/complete", ready: (p: Page) => expect(p.getByRole("heading", { level: 1, name: "Module complete" })).toBeVisible() },
];

const canvasOf = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const storedTheme = (page: Page) => page.evaluate(() => [document.documentElement.dataset.theme ?? null, localStorage.getItem("spindle-theme")]);

async function contextFor(browser: Browser, colorScheme: "light" | "dark") {
  const context = await browser.newContext({ colorScheme });
  // Records data-theme at the moment <body> is created: if the theme is right then, no frame can show the wrong one.
  await context.addInitScript(() => {
    const w = window as unknown as { __themeAtBody?: string | null };
    new MutationObserver((_m, observer) => {
      if (document.body) {
        w.__themeAtBody = document.documentElement.dataset.theme ?? null;
        observer.disconnect();
      }
    }).observe(document, { childList: true, subtree: true });
  });
  return context;
}

test.describe("theme choice", () => {
  test("follows the system setting until the reader chooses", async ({ browser }) => {
    for (const scheme of ["light", "dark"] as const) {
      const context = await contextFor(browser, scheme);
      const page = await context.newPage();
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await storedTheme(page)).toEqual([null, null]);
      expect(await canvasOf(page), `system ${scheme}`).toBe(CANVAS[scheme]);
      await context.close();
    }
  });

  test("the toggle switches, persists across reloads and pages, and is on <html> before first paint", async ({ browser }) => {
    const context = await contextFor(browser, "light");
    const page = await context.newPage();
    await page.goto("/");
    const toggle = page.getByRole("banner").getByRole("button", TOGGLE);
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect.poll(() => canvasOf(page)).toBe(CANVAS.dark);
    expect(await storedTheme(page)).toEqual(["dark", "dark"]);

    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await canvasOf(page), "after reload").toBe(CANVAS.dark);
    expect(await page.evaluate(() => (window as unknown as { __themeAtBody?: string | null }).__themeAtBody), "theme when <body> was created").toBe("dark");

    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
    expect(await canvasOf(page), "on another page").toBe(CANVAS.dark);

    await page.getByRole("banner").getByRole("button", TOGGLE).click();
    await expect.poll(() => canvasOf(page)).toBe(CANVAS.light);
    await page.reload();
    expect(await storedTheme(page)).toEqual(["light", "light"]);
    expect(await page.evaluate(() => (window as unknown as { __themeAtBody?: string | null }).__themeAtBody)).toBe("light");
    await context.close();
  });

  test("the server sends the theme script at the top of <head>, before any stylesheet or body", async ({ request }) => {
    const html = await (await request.get("/")).text();
    const head = html.slice(0, html.indexOf("<body"));
    const script = head.indexOf("spindle-theme");
    expect(script, "theme script in <head>").toBeGreaterThan(-1);
    const firstStyle = head.search(/<link[^>]+rel="stylesheet"/);
    if (firstStyle > -1) expect(script, "script before the first stylesheet").toBeLessThan(firstStyle);
  });

  test("?theme= sets and keeps the theme against the system setting", async ({ browser }) => {
    const context = await contextFor(browser, "light");
    const page = await context.newPage();
    await page.goto("/?theme=dark");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await canvasOf(page)).toBe(CANVAS.dark);
    await page.goto("/coaches");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await canvasOf(page)).toBe(CANVAS.dark);
    await context.close();
  });
});

test.describe("axe and contrast in both themes", () => {
  const routes = process.env.CI ? ROUTES : [...ROUTES, ...DEV_ROUTES];
  for (const theme of ["light", "dark"] as const) {
    test(`Lab ${theme}: every key route passes axe at 320, 390 and 1440px`, async ({ browser }) => {
      test.setTimeout(240_000);
      // The opposite system setting, so the stored choice (from ?theme=) is what is being tested.
      const context = await contextFor(browser, theme === "light" ? "dark" : "light");
      const page = await context.newPage();
      await page.goto(`/?theme=${theme}`);
      for (const [width, height] of WIDTHS) {
        await page.setViewportSize({ width, height });
        for (const route of routes) {
          await page.goto(route.path);
          await route.ready(page);
          await page.waitForLoadState("networkidle");
          expect(await canvasOf(page), `${route.path} canvas`).toBe(CANVAS[theme]);
          const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
          expect(
            axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`),
            `${route.path} at ${width}px in ${theme}`,
          ).toEqual([]);
          expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${route.path} at ${width}px scrolls sideways`).toBe(0);
        }
      }
      // Body text aims at AAA: the text token on the canvas, computed in the page.
      const ratio = await page.evaluate(() => {
        const lum = (c: string) => {
          const [r, g, b] = (c.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number).map((v) => {
            const s = v / 255;
            return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
        };
        const style = getComputedStyle(document.body);
        const [x, y] = [lum(style.color), lum(style.backgroundColor)].sort((p, q) => q - p);
        return (x! + 0.05) / (y! + 0.05);
      });
      expect(ratio, "body text on the canvas").toBeGreaterThanOrEqual(7);
      await context.close();
    });
  }
});

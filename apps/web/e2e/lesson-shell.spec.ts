import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { courseJson, PlayerWorld, practice, type Actor } from "./player-fixtures";
import { learnPath, signIn } from "./helpers/sign-in";

// M2a, the learner navigation shell: the bottom lesson bar (progress readout and outline), the outline
// bottom sheet, and the learn home's resume card, in Lab Light and Lab Dark. Binding checks from the
// plan audit: the bar never covers focus at the page end, it wraps at 320px and at 200% text, text
// spacing overrides do not clip it, and the sheet traps focus, closes on Esc and restores focus.

test.describe.configure({ mode: "serial" });

const world = new PlayerWorld();
const actors: Record<string, Actor> = {};
let gym: { id: string; slug: string };
let assignment = "";
const LONG = "Synthetic lesson whose title is long enough to wrap on any phone screen at all";
const ids = { course: randomUUID(), part: randomUUID(), lessons: [randomUUID(), randomUUID(), randomUUID(), randomUUID()] };
const lessonPath = (n: number) => learnPath(gym, assignment, `shell-${n}`);
const WIDTHS = [
  [320, 700],
  [390, 844],
  [1440, 900],
] as const;

test.beforeAll(async () => {
  test.setTimeout(180_000);
  world.publisher();
  for (const name of ["shellowner", "shelllearner"]) actors[name] = await world.actor(name);
  gym = world.gym("shell", actors.shellowner!);
  world.join(gym, actors.shellowner!, actors.shelllearner!);
  const version = world.publishGlobal(
    courseJson(
      ids.course,
      ids.part,
      "base",
      "Synthetic shell course",
      ids.lessons.map((id, i) => ({ id, slug: `shell-${i + 1}`, title: i === 1 ? LONG : `Synthetic shell lesson ${i + 1}`, blocks: [practice(`Synthetic text ${i + 1}.`)] })),
    ),
  );
  assignment = world.assign(gym, actors.shellowner!, version, actors.shelllearner!);
});

test.afterAll(async () => {
  await world.cleanup();
});

/** The dock's top edge, and whether the focused element's box (with its 7px ring) ends above it. */
async function focusClearsDock(page: Page) {
  return page.evaluate(() => {
    const dock = document.querySelector("[data-lesson-dock]")!.getBoundingClientRect();
    const r = document.activeElement!.getBoundingClientRect();
    return { clear: r.bottom + 7 <= dock.top + 0.5, bottom: Math.round(r.bottom), dockTop: Math.round(dock.top) };
  });
}

async function tabToLast(page: Page) {
  // Shift+Tab from the end of the document reaches the last focusable control in the page.
  await page.locator("body").press("End");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const last = page.locator("main a, main button").filter({ visible: true }).last();
  await last.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(last).toBeFocused();
}

test("the lesson bar shows where you are, wraps on phones, and never covers focus at the end, in both themes", async ({ browser }) => {
  const page = await signIn(browser, actors.shelllearner!, lessonPath(2));
  for (const theme of ["light", "dark"] as const) {
    await page.goto(`${lessonPath(2)}?theme=${theme}`);
    for (const [width, height] of WIDTHS) {
      await page.setViewportSize({ width, height });
      await page.goto(lessonPath(2));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(LONG);
      const dock = page.locator("[data-lesson-dock]");
      await expect(dock).toBeVisible();
      await expect(dock.getByText("Lesson 2 of 4, 0 done")).toBeAttached();
      await expect(dock.locator("[data-segment='current']")).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `sideways scroll at ${width}`).toBe(0);
      await tabToLast(page);
      const at = await focusClearsDock(page);
      expect(at.clear, `focus at the end at ${width} in ${theme}: ${JSON.stringify(at)}`).toBe(true);
      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 2).join(" | ")}`), `${width} ${theme}`).toEqual([]);
    }
  }
});

test("at 200% text and with WCAG text spacing, the bar wraps instead of clipping and focus still clears it", async ({ browser }) => {
  const page = await signIn(browser, actors.shelllearner!, lessonPath(2));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(lessonPath(2));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // True text resize (not only a narrow viewport), then the WCAG 1.4.12 text-spacing overrides.
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await page.addStyleTag({
    content: "* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }",
  });
  for (const [width, height] of [[1280, 800], [640, 400]] as const) {
    await page.setViewportSize({ width, height });
    const clipped = await page.locator("[data-lesson-dock]").evaluate((root) =>
      [root, ...root.querySelectorAll("*")]
        // Screen-reader-only text is clipped to 1px on purpose.
        .filter((el) => !(el instanceof SVGElement) && !el.classList.contains("sr-only") && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1)
        .map((el) => el.tagName),
    );
    expect(clipped, `dock content clipped at ${width}`).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `sideways scroll at ${width}`).toBe(0);
    await tabToLast(page);
    expect((await focusClearsDock(page)).clear, `focus clears the bar at ${width}`).toBe(true);
  }
});

test("the outline sheet: keyboard opens it, Tab stays inside, Esc closes it, focus returns to the trigger", async ({ browser }) => {
  const page = await signIn(browser, actors.shelllearner!, lessonPath(2), { width: 390, height: 844 });
  await page.goto(lessonPath(2));
  // The triggers act once the page has hydrated.
  await page.waitForLoadState("networkidle");
  // The router may keep an earlier page's (closed) sheet hidden for back navigation: the open one is the sheet.
  const sheet = page.locator("dialog[data-outline-sheet][open]");
  for (const which of ["top", "dock"] as const) {
    const trigger = which === "top" ? page.locator("[data-outline-trigger]").filter({ visible: true }) : page.locator("[data-lesson-dock]").filter({ visible: true }).getByRole("button", { name: "Outline" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("heading", { name: "Course outline" })).toBeVisible();
    // Initial focus is inside the sheet, and Tab never leaves it.
    expect(await page.evaluate(() => !!document.activeElement?.closest("dialog[data-outline-sheet]"))).toBe(true);
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => !!document.activeElement?.closest("dialog[data-outline-sheet]")), `${which}: Tab ${i + 1} stays in the sheet`).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(trigger, `${which}: focus returns to the trigger`).toBeFocused();
  }
  // The current lesson is marked, and choosing another lesson closes the sheet and opens it.
  await page.locator("[data-outline-trigger]").filter({ visible: true }).click();
  await expect(sheet.locator("[aria-current='page']")).toContainText(LONG);
  await sheet.getByRole("link", { name: /Synthetic shell lesson 3/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Synthetic shell lesson 3");
  await expect(sheet).toHaveCount(0);
  // From 1024px the outline is the sidebar and the sheet's triggers are gone.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator("[data-outline-trigger]").filter({ visible: true })).toHaveCount(0);
  await expect(page.locator("[data-lesson-dock] button").filter({ visible: true, hasText: "Outline" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Course outline" }).first()).toBeVisible();
});

test("the learn home's resume card carries the course's progress readout, and passes axe in both themes", async ({ browser }) => {
  const page = await signIn(browser, actors.shelllearner!, learnPath(gym));
  for (const theme of ["light", "dark"] as const) {
    await page.goto(`${learnPath(gym)}?theme=${theme}`);
    const resume = page.locator("[data-resume]");
    await expect(resume.getByRole("heading", { level: 2 })).toHaveText("Synthetic shell lesson 1");
    await expect(resume.locator("[data-progress-track]")).toContainText("Lesson 1 of 4, 0 done");
    for (const [width, height] of WIDTHS) {
      await page.setViewportSize({ width, height });
      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      expect(axe.violations.map((v) => v.id), `learn home at ${width} in ${theme}`).toEqual([]);
    }
  }
});

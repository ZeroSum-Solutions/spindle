import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { courseJson, PlayerWorld, practice, type Actor, type Json } from "./player-fixtures";
import { learnPath, signIn } from "./helpers/sign-in";

// M2a, the learner navigation shell: below 1024px the bottom lesson bar (progress readout and Outline on
// one row, the full-width named next action below), the outline bottom sheet, and the learn home's
// resume card, in Lab Light and Lab Dark. From 1024px the bar is gone (the sidebar and the in-lesson
// navigation take over). Binding checks from the plan audit and Sol R1 on #53: the bar never covers focus
// reached by keyboard, it reflows at 320px with 200% text, text spacing does not clip it or the sheet,
// the sheet traps focus both ways, locks background scroll, closes on Esc, restores focus (also when the
// opener is gone), and closes itself when the viewport widens past 1024px.
// RED FIRST (Sol R1 on #53): these cases failed on 2fb1d23.
// Sol R2 on #53 (at 3d7e4a1), red first: back navigation with the sheet open, a long next title at 200%,
// completing a lesson with the sheet open, widening with a late lesson open, and a 60-lesson course.

test.describe.configure({ mode: "serial" });

const world = new PlayerWorld();
const actors: Record<string, Actor> = {};
let gym: { id: string; slug: string };
let assignment = "";
const LONG = "Synthetic lesson whose title is long enough to wrap on any phone screen at all";
const ids = { course: randomUUID(), part: randomUUID(), lessons: [randomUUID(), randomUUID(), randomUUID(), randomUUID()] };
const lessonPath = (n: number) => learnPath(gym, assignment, `shell-${n}`);
// A long course for its own learner, so the four-lesson course's progress stays untouched.
const LONG_COUNT = 60;
const longIds = { course: randomUUID(), part: randomUUID(), lessons: Array.from({ length: LONG_COUNT }, () => randomUUID()) };
let longAssignment = "";
const longPath = (n: number) => learnPath(gym, longAssignment, `long-${n}`);
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const PHONES = [
  [320, 700],
  [390, 844],
] as const;
// A safety callout in lesson 2, so the bar is checked against safety content too.
const SAFETY: Json = { kind: "callout", content: { label: "Stop and refer", text: "Synthetic safety text: stop and refer when the synthetic sign appears." }, support: "practice-based", claimIds: [] };
const BIG_TEXT = "html { font-size: 200% !important; }";
const SPACING = "* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }";

test.beforeAll(async () => {
  test.setTimeout(180_000);
  world.publisher();
  for (const name of ["shellowner", "shelllearner", "shelllong"]) actors[name] = await world.actor(name);
  gym = world.gym("shell", actors.shellowner!);
  world.join(gym, actors.shellowner!, actors.shelllearner!);
  world.join(gym, actors.shellowner!, actors.shelllong!);
  const version = world.publishGlobal(
    courseJson(
      ids.course,
      ids.part,
      "base",
      "Synthetic shell course",
      ids.lessons.map((id, i) => ({
        id,
        slug: `shell-${i + 1}`,
        title: i === 1 ? LONG : `Synthetic shell lesson ${i + 1}`,
        blocks: i === 1 ? [practice("Synthetic text 2."), SAFETY, practice("Synthetic closing text.")] : [practice(`Synthetic text ${i + 1}.`)],
      })),
    ),
  );
  assignment = world.assign(gym, actors.shellowner!, version, actors.shelllearner!);
  const longVersion = world.publishGlobal(
    courseJson(
      longIds.course,
      longIds.part,
      "base",
      "Synthetic long course",
      longIds.lessons.map((id, i) => ({ id, slug: `long-${i + 1}`, title: `Synthetic long lesson ${i + 1}`, blocks: [practice(`Synthetic long text ${i + 1}.`)] })),
    ),
  );
  longAssignment = world.assign(gym, actors.shellowner!, longVersion, actors.shelllong!);
});

test.afterAll(async () => {
  await world.cleanup();
});

const dock = (page: Page) => page.locator("[data-lesson-dock]");
// The router may keep an earlier lesson's page (and its bar) hidden for back navigation.
const shownDock = (page: Page) => dock(page).filter({ visible: true });
const openModals = (page: Page) => page.evaluate(() => document.querySelectorAll("dialog:modal").length);
const rootOverflow = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).overflow);
const sheet = (page: Page) => page.locator("dialog[data-outline-sheet][open]");
const inSheet = (page: Page) => page.evaluate(() => !!document.activeElement?.closest("dialog[data-outline-sheet]"));

/** Tabs from the top of the page to its last control, by keyboard only, checking every stop clears the bar. */
async function tabThroughPage(page: Page, what: string) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Tab");
  const covered: string[] = [];
  for (let i = 0; i < 60; i++) {
    const at = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      const bar = document.querySelector("[data-lesson-dock]") as HTMLElement | null;
      if (!el || el === document.body) return { done: true };
      const r = el.getBoundingClientRect();
      const inBar = !!el.closest("[data-lesson-dock]");
      const top = bar && bar.checkVisibility() ? bar.getBoundingClientRect().top : Infinity;
      return { done: false, inBar, clear: inBar || r.bottom + 7 <= top + 0.5, label: (el.textContent ?? "").trim().slice(0, 40) };
    });
    if (at.done) break;
    if (!at.inBar && !at.clear) covered.push(at.label!);
    await page.keyboard.press("Tab");
  }
  expect(covered, `${what}: controls under the bar`).toEqual([]);
}

test("below 1024px the bar holds progress, Outline and the named next action; it is gone from 1024px; both themes", async ({ browser }) => {
  const page = await signIn(browser, actors.shelllearner!, lessonPath(2));
  for (const theme of ["light", "dark"] as const) {
    await page.goto(`${lessonPath(2)}?theme=${theme}`);
    for (const [width, height] of PHONES) {
      await page.setViewportSize({ width, height });
      await page.goto(lessonPath(2));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(LONG);
      await expect(dock(page)).toBeVisible();
      await expect(dock(page).getByText("Lesson 2 of 4, 0 done")).toBeAttached();
      await expect(dock(page).locator("[data-current='true']")).toHaveCount(1);
      // Row 1: the readout and Outline; row 2: the full-width named next action.
      const next = dock(page).getByRole("link", { name: /Next lesson.*Synthetic shell lesson 3/ });
      await expect(next).toBeVisible();
      const [barBox, nextBox, outlineBox] = [(await dock(page).boundingBox())!, (await next.boundingBox())!, (await dock(page).getByRole("button", { name: "Outline" }).boundingBox())!];
      expect(nextBox.width, "next is full width").toBeGreaterThanOrEqual(barBox.width - 2 * 16 - 1);
      expect(nextBox.height).toBeGreaterThanOrEqual(48);
      expect(outlineBox.y + outlineBox.height, "Outline sits above the next action").toBeLessThanOrEqual(nextBox.y + 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `sideways scroll at ${width}`).toBe(0);
      await tabThroughPage(page, `${width} ${theme}`);
      // The safety callout scrolled into view stays clear of the bar.
      const safety = page.getByText("Synthetic safety text", { exact: false });
      await safety.scrollIntoViewIfNeeded();
      const [s, d] = [(await safety.boundingBox())!, (await dock(page).boundingBox())!];
      expect(s.y + s.height, "safety text clear of the bar").toBeLessThanOrEqual(d.y);
      const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 2).join(" | ")}`), `${width} ${theme}`).toEqual([]);
    }
    // From 1024px: no bar, no reserved space, the sidebar and the in-lesson navigation instead.
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(dock(page)).toBeHidden();
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--dock-h").trim())).toBe("0px");
    await expect(page.getByRole("navigation", { name: "Lesson navigation" }).getByRole("link", { name: /Next lesson/ })).toBeVisible();
    await tabThroughPage(page, `1440 ${theme}`);
  }
});

test("the bar honours the safe-area inset (declared in the stylesheet)", async ({ browser }) => {
  // Chromium cannot emulate a notch: assert the bar's padding is computed from env(safe-area-inset-bottom).
  const page = await signIn(browser, actors.shelllearner!, lessonPath(2), { width: 390, height: 844 });
  await page.goto(lessonPath(2));
  const declared = await page.evaluate(() => {
    const bar = document.querySelector("[data-lesson-dock]")!;
    for (const sheetRules of [...document.styleSheets]) {
      try {
        for (const r of [...sheetRules.cssRules] as CSSStyleRule[]) if (r.selectorText && bar.matches(r.selectorText) && r.cssText.includes("safe-area-inset-bottom")) return true;
      } catch {
        /* cross-origin sheet */
      }
    }
    return false;
  });
  expect(declared).toBe(true);
});

test("at 320px with 200% text and WCAG text spacing, the bar and the sheet reflow without clipping", async ({ browser }) => {
  const page = await signIn(browser, actors.shelllearner!, lessonPath(2), { width: 320, height: 700 });
  for (const [width, height] of [[320, 700], [640, 400]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto(lessonPath(2));
    await page.waitForLoadState("networkidle");
    await page.addStyleTag({ content: BIG_TEXT });
    await page.addStyleTag({ content: SPACING });
    const clipped = (root: string) =>
      page.locator(root).first().evaluate((r) =>
        [r, ...r.querySelectorAll("*")]
          // Screen-reader-only text is clipped to 1px on purpose.
          .filter((el) => !(el instanceof SVGElement) && !el.classList.contains("sr-only") && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1)
          .map((el) => `${el.tagName} ${el.scrollWidth}>${el.clientWidth}`),
      );
    expect(await clipped("[data-lesson-dock]"), `bar clipped at ${width}`).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `sideways scroll at ${width}`).toBe(0);
    await tabThroughPage(page, `200% at ${width}`);
    await page.locator("[data-outline-trigger]").filter({ visible: true }).click();
    await expect(sheet(page)).toBeVisible();
    expect(await clipped("dialog[data-outline-sheet][open]"), `sheet clipped at ${width}`).toEqual([]);
    // The sheet scrolls inside itself.
    expect(await sheet(page).evaluate((d) => getComputedStyle(d).overflowY)).toBe("auto");
    await page.keyboard.press("Escape");
  }
});

test("the outline sheet: both triggers, Tab and Shift+Tab stay inside, scroll locked, Esc closes, focus returns, axe clean", async ({ browser }) => {
  const page = await signIn(browser, actors.shelllearner!, lessonPath(2), { width: 390, height: 844 });
  for (const theme of ["light", "dark"] as const) {
    await page.goto(`${lessonPath(2)}?theme=${theme}`);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => window.scrollTo(0, 200));
    for (const which of ["top", "dock"] as const) {
      const trigger = which === "top" ? page.locator("[data-outline-trigger]").filter({ visible: true }) : dock(page).getByRole("button", { name: "Outline" });
      await trigger.focus();
      // Focusing a trigger that is partly off screen scrolls it into view: the position to keep is the one after that.
      const scrolled = await page.evaluate(() => window.scrollY);
      await page.keyboard.press("Enter");
      await expect(sheet(page)).toBeVisible();
      await expect(sheet(page).getByRole("heading", { name: "Course outline" })).toBeVisible();
      expect(await inSheet(page), `${which}: initial focus inside`).toBe(true);
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press("Tab");
        expect(await inSheet(page), `${which}: Tab ${i + 1}`).toBe(true);
      }
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press("Shift+Tab");
        expect(await inSheet(page), `${which}: Shift+Tab ${i + 1}`).toBe(true);
      }
      // The page behind is locked: no scroll, at the same position.
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe("hidden");
      await page.mouse.wheel(0, 600);
      expect(await page.evaluate(() => window.scrollY), `${which}: background did not scroll`).toBe(scrolled);
      const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(axe.violations.map((v) => v.id), `open sheet, ${theme}`).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(sheet(page)).toHaveCount(0);
      await expect(trigger, `${which}: focus returns to the trigger`).toBeFocused();
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow), "scroll lock released").not.toBe("hidden");
      expect(await page.evaluate(() => window.scrollY), "scroll position kept").toBe(scrolled);
    }
  }
  // Removed opener: focus falls back to the top trigger.
  await dock(page).getByRole("button", { name: "Outline" }).click();
  await expect(sheet(page)).toBeVisible();
  await page.evaluate(() => document.querySelector("[data-lesson-dock] button")?.remove());
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-outline-trigger]").filter({ visible: true })).toBeFocused();
  // Choosing a lesson closes the sheet and opens it.
  await page.locator("[data-outline-trigger]").filter({ visible: true }).click();
  await expect(sheet(page).locator("[aria-current='page']")).toContainText(LONG);
  await sheet(page).getByRole("link", { name: /Synthetic shell lesson 3/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Synthetic shell lesson 3");
  await expect(sheet(page)).toHaveCount(0);
});

test("widening past 1024px with the sheet open closes it, releases the page and moves focus to the sidebar", async ({ browser }) => {
  const page = await signIn(browser, actors.shelllearner!, lessonPath(2), { width: 390, height: 844 });
  await page.goto(lessonPath(2));
  await page.waitForLoadState("networkidle");
  await page.locator("[data-outline-trigger]").filter({ visible: true }).click();
  await expect(sheet(page)).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(sheet(page)).toHaveCount(0);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe("hidden");
  // Not inert: the sidebar's current lesson has focus and Tab moves on through the page.
  const current = page.getByRole("navigation", { name: "Course outline" }).filter({ visible: true }).locator("[aria-current='page']");
  await expect(current).toBeFocused();
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
});

test("the learn home's resume card carries the progress readout, reflows at 200% text, and passes axe in both themes", async ({ browser }) => {
  const page = await signIn(browser, actors.shelllearner!, learnPath(gym));
  for (const theme of ["light", "dark"] as const) {
    await page.goto(`${learnPath(gym)}?theme=${theme}`);
    const resume = page.locator("[data-resume]");
    await expect(resume.getByRole("heading", { level: 2 })).toHaveText("Synthetic shell lesson 1");
    await expect(resume.locator("[data-progress-track]")).toContainText("Lesson 1 of 4, 0 done");
    for (const [width, height] of [...PHONES, [1440, 900]] as const) {
      await page.setViewportSize({ width, height });
      const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(axe.violations.map((v) => v.id), `learn home at ${width} in ${theme}`).toEqual([]);
    }
  }
  await page.setViewportSize({ width: 320, height: 700 });
  await page.addStyleTag({ content: BIG_TEXT });
  await page.addStyleTag({ content: SPACING });
  const wide = await page.locator("[data-resume]").evaluate((r) =>
    [r, ...r.querySelectorAll("*")].filter((el) => !(el instanceof SVGElement) && !el.classList.contains("sr-only") && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1).map((el) => el.tagName),
  );
  expect(wide, "resume card clipped at 200%").toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
});

test("back navigation with the sheet open leaves no modal behind: the earlier lesson is usable", async ({ browser }) => {
  const page = await signIn(browser, actors.shelllearner!, lessonPath(1), { width: 390, height: 844 });
  await page.goto(lessonPath(1));
  await page.waitForLoadState("networkidle");
  // A client navigation, so the router keeps lesson 1 for the way back.
  await shownDock(page).getByRole("link", { name: /Next lesson/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(LONG);
  await shownDock(page).getByRole("button", { name: "Outline" }).click();
  await expect(sheet(page)).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Synthetic shell lesson 1");
  await expect.poll(() => openModals(page), "no modal left open in a hidden page").toBe(0);
  expect(await rootOverflow(page)).not.toBe("hidden");
  // Not inert: lesson 1's own bar works.
  await shownDock(page).getByRole("button", { name: "Outline" }).click({ timeout: 5000 });
  await expect(sheet(page).filter({ visible: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect.poll(() => openModals(page)).toBe(0);
});

test("a long next-lesson title at 320px with 200% text keeps the bar within half the viewport, Outline on screen", async ({ browser }) => {
  // Lesson 1's next lesson is the long title.
  const page = await signIn(browser, actors.shelllearner!, lessonPath(1), { width: 320, height: 700 });
  await page.goto(lessonPath(1));
  await page.waitForLoadState("networkidle");
  await page.addStyleTag({ content: BIG_TEXT });
  await page.addStyleTag({ content: SPACING });
  const bar = shownDock(page);
  const next = bar.getByRole("link", { name: new RegExp(`Next lesson.*${LONG}`) });
  await expect(next, "the full title stays in the accessible name").toBeAttached();
  const box = (await bar.boundingBox())!;
  expect(box.height, "bar height at 700px").toBeLessThanOrEqual(350.5);
  const outline = bar.getByRole("button", { name: "Outline" });
  await outline.focus();
  const o = (await outline.boundingBox())!;
  expect(o.y, "Outline below the bar's top").toBeGreaterThanOrEqual(box.y - 0.5);
  expect(o.y + o.height, "Outline on screen").toBeLessThanOrEqual(700.5);
  await next.focus();
  const n = (await next.boundingBox())!;
  expect(n.y + n.height, "next action on screen when focused").toBeLessThanOrEqual(700.5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  await tabThroughPage(page, "long next title at 200%");
});

test("completing a lesson with the sheet open keeps the page locked under the open sheet", async ({ browser }) => {
  const page = await signIn(browser, actors.shelllong!, longPath(1), { width: 390, height: 844 });
  await page.goto(longPath(1));
  await page.waitForLoadState("networkidle");
  const before = await page.locator("dialog[data-outline-sheet]").getAttribute("id");
  await page.locator("[data-outline-trigger]").filter({ visible: true }).click();
  await expect(sheet(page)).toBeVisible();
  // The page behind is inert, so submit the completion form directly; the server action refreshes the page,
  // which renders a new sheet id.
  await page.getByRole("button", { name: "Mark lesson complete" }).evaluate((b: HTMLButtonElement) => b.click());
  await expect(page.getByTestId("lesson-status")).toBeAttached();
  await expect.poll(() => page.locator("dialog[data-outline-sheet]").getAttribute("id"), "the refresh renders a new sheet id").not.toBe(before);
  expect(await openModals(page), "the sheet is still open").toBe(1);
  expect(await rootOverflow(page), "the page behind is still locked").toBe("hidden");
  await page.keyboard.press("Escape");
  await expect.poll(() => openModals(page)).toBe(0);
  expect(await rootOverflow(page)).not.toBe("hidden");
});

test("widening past 1024px with a late lesson open moves focus to the sidebar's current lesson, on screen", async ({ browser }) => {
  const page = await signIn(browser, actors.shelllong!, longPath(40), { width: 390, height: 844 });
  await page.goto(longPath(40));
  await page.waitForLoadState("networkidle");
  await page.locator("[data-outline-trigger]").filter({ visible: true }).click();
  await expect(sheet(page)).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect.poll(() => openModals(page)).toBe(0);
  const current = page.getByRole("navigation", { name: "Course outline" }).filter({ visible: true }).locator("[aria-current='page']");
  await expect(current).toBeFocused();
  await expect(current).toContainText("Synthetic long lesson 40");
  const r = (await current.boundingBox())!;
  expect(r.y, "current lesson below the top").toBeGreaterThanOrEqual(0);
  expect(r.y + r.height, "current lesson above the bottom").toBeLessThanOrEqual(800);
});

test("a 60-lesson course: every segment of the track keeps a visible width at 320px, also at 200% text", async ({ browser }) => {
  const page = await signIn(browser, actors.shelllong!, longPath(40), { width: 320, height: 700 });
  await page.goto(longPath(40));
  await page.waitForLoadState("networkidle");
  const segments = shownDock(page).locator("[data-segment]");
  await expect(segments).toHaveCount(LONG_COUNT);
  await expect(shownDock(page).getByText(/Lesson 40 of 60/)).toBeAttached();
  const narrowest = () => segments.evaluateAll((els) => Math.min(...els.map((e) => e.getBoundingClientRect().width)));
  expect(await narrowest(), "narrowest segment at 320px").toBeGreaterThanOrEqual(1);
  await page.addStyleTag({ content: BIG_TEXT });
  await page.addStyleTag({ content: SPACING });
  expect(await narrowest(), "narrowest segment at 200% text").toBeGreaterThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
});

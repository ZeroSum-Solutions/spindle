import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { lessonBlockSchema } from "@spindle/schema";
import { courseJson, PlayerWorld, sql, type Actor } from "./player-fixtures";
import { learnPath, signIn } from "./helpers/sign-in";

// Phase-3 acceptance (plan section 12): the real eight shoulder lesson drafts, published as a
// synthetic global course, taken end to end by a synthetic trainer in a synthetic gym.
//
// FIXTURE ONLY, NEVER REAL APPROVALS: every claim slot in the drafts is bound to a synthetic
// claim with a synthetic approval receipt recorded through the real RPCs, citing one synthetic
// source. That includes lesson 1's six anatomy claims, which are blocked in the real claim
// pipeline (no admissible source yet). Nothing here says anything about the real claims.

type Json = Record<string, unknown>;
interface Block extends Json {
  kind: string;
  content: unknown;
  support?: string;
  claimIds?: string[];
}
interface Draft {
  lessonNumber: number;
  lesson: { slug: string; title: string; summary: string; durationMinutes: number; format: string; objectives: string[]; anatomyIds: string[]; blocks: Block[]; media: Json[]; resources: Json[] };
}

const DRAFTS = join(__dirname, "../../../content/shoulder/drafts");
const drafts: Draft[] = readdirSync(DRAFTS)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(DRAFTS, f), "utf8")) as Draft);

const world = new PlayerWorld();
const actors: Record<string, Actor> = {};
let gym: { id: string; slug: string };
let assignment: string;
const ids = { course: randomUUID(), part: randomUUID(), lessons: drafts.map(() => randomUUID()) };

/** Rows that must be back to their starting count after cleanup. */
const BASELINE_SQL = `select json_build_object(
  'users', (select count(*) from auth.users), 'orgs', (select count(*) from public.orgs),
  'courses', (select count(*) from public.courses), 'versions', (select count(*) from public.curriculum_versions),
  'claims', (select count(*) from public.claims), 'sources', (select count(*) from public.sources),
  'assignments', (select count(*) from public.assignments), 'completions', (select count(*) from public.lesson_completions),
  'attempts', (select count(*) from public.quiz_attempts), 'runs', (select count(*) from public.review_runs))`;
let baseline: string;

/**
 * A diagram block as the published schema of this checkout accepts it. Before Sol R16 a diagram is
 * {diagramId, caption}; after it, the reviewed shape with alt, caption, legend and support. The
 * drafts still carry the old shape until the content follow-up, so the fixture adapts.
 */
function diagramBlock(block: Block): Block {
  const { diagramId, caption } = block.content as { diagramId: string; caption: string };
  const reviewed: Block = { kind: "diagram", content: { diagramId, alt: caption || diagramId, caption, legend: [] }, support: "practice-based", claimIds: [] };
  return lessonBlockSchema.safeParse(reviewed).success ? reviewed : block;
}

/** The drafts' claim slots become the synthetic claims; lesson ids become run-owned UUIDs. */
function publishedCourse(claims: Map<string, string>): Json {
  const course = courseJson(ids.course, ids.part, "base", "Shoulder module (synthetic acceptance copy)", []);
  const part = (course.parts as Json[])[0]!;
  part.title = "Shoulder";
  part.lessons = drafts.map((d, i) => ({
    ...d.lesson,
    id: ids.lessons[i],
    blocks: d.lesson.blocks.map((b) =>
      b.kind === "diagram" ? diagramBlock(b) : "claimIds" in b ? { ...b, claimIds: b.claimIds!.map((slot) => claims.get(slot)!) } : b,
    ),
  }));
  return course;
}

/** Graded questions in the order the engine numbers them: per lesson, `<lessonId>:q<n>` over its science quizzes. */
const questions = drafts.flatMap((d, i) =>
  d.lesson.blocks
    .filter((b) => b.kind === "quiz" && b.support === "science")
    .map((b, n) => {
      const q = b.content as { prompt: string; options: string[]; answerIndex: number; explanation: string };
      return { id: `${ids.lessons[i]}:q${n + 1}`, ...q };
    }),
);

/**
 * Assessments followed by their stop-and-refer warning, per lesson, as the drafts have them on main.
 * Pinned so that a warning removed or moved away from its assessment fails the test.
 */
const REQUIRED_PAIRS: Record<string, number> = {
  "shoulder-anatomy": 1,
  "scapulohumeral-rhythm": 1,
  "mobility-and-stability": 1,
  "screens-and-red-flags": 3,
  "correctives-and-activation": 1,
  "loading-the-shoulder": 3,
  "throwing-and-rotation": 1,
  "when-to-refer-out": 0,
};

async function answerAll(page: Page, pick: (q: (typeof questions)[number]) => number) {
  for (const q of questions) await page.locator(`fieldset[data-question="${q.id}"] input[value="${pick(q)}"]`).check();
}

test.describe.serial("shoulder module acceptance", () => {
  test.beforeAll(async () => {
    test.setTimeout(240_000);
    baseline = sql(BASELINE_SQL);
    world.publisher();
    for (const name of ["mowner", "trainer"]) actors[name] = await world.actor(name);
    gym = world.gym("module", actors.mowner!);
    world.join(gym, actors.mowner!, actors.trainer!);
    const slots = [...new Set(drafts.flatMap((d) => d.lesson.blocks.flatMap((b) => b.claimIds ?? [])))];
    const claims = world.syntheticClaims(slots);
    const version = world.publishGlobal(publishedCourse(claims));
    assignment = world.assign(gym, actors.mowner!, version, actors.trainer!);
  });

  test.afterAll(async () => {
    await world.cleanup();
    expect(sql(BASELINE_SQL), "cleanup must restore the starting row counts").toBe(baseline);
  });

  test("the published copy carries every draft lesson and graded question", () => {
    expect(drafts).toHaveLength(8);
    expect(questions.length).toBeGreaterThan(0);
    const published = Number(sql(`select count(*) from public.version_lessons vl join public.assignments a on a.version_id = vl.version_id where a.id = '${assignment}'`));
    expect(published).toBe(8);
  });

  test("no answer key reaches the browser before an attempt is submitted", async ({ browser }) => {
    const page = await signIn(browser, actors.trainer!, learnPath(gym, assignment, "module/quiz"));
    // Each response must be the real page (200, no redirect, the right content type and its own
    // title), so an error or sign-in page can never pass for a redacted one.
    const pages = [
      { path: learnPath(gym, assignment, "module/quiz"), marker: "Module quiz" },
      ...drafts.map((d) => ({ path: learnPath(gym, assignment, d.lesson.slug), marker: d.lesson.title })),
    ];
    for (const { path, marker } of pages) {
      for (const [headers, type] of [[{}, "text/html"], [{ RSC: "1" }, "text/x-component"]] as [Record<string, string>, string][]) {
        const res = await page.request.get(path, { headers, maxRedirects: 0 });
        const what = `${path} ${JSON.stringify(headers)}`;
        expect(res.status(), what).toBe(200);
        expect(new URL(res.url()).pathname, what).toBe(path);
        expect(res.headers()["content-type"] ?? "", what).toContain(type);
        const body = await res.text();
        expect(body, what).toContain(marker);
        // The bare token, so an escaped key (\"answerIndex\") is caught too.
        expect(body, what).not.toContain("answerIndex");
        for (const q of questions) expect(body, what).not.toContain(q.explanation);
      }
    }
  });

  test("every lesson renders all its blocks with support, sources and safety, and completes", async ({ browser }) => {
    test.setTimeout(300_000);
    const page = await signIn(browser, actors.trainer!, learnPath(gym, assignment));
    for (const d of drafts) {
      const blocks = d.lesson.blocks;
      await page.goto(learnPath(gym, assignment, d.lesson.slug));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(d.lesson.title);
      const article = page.locator("article").first();

      // Every block kind, counted against the draft.
      for (const kind of ["paragraph", "callout", "checklist", "quiz", "diagram"]) {
        await expect(article.locator(`[data-block="${kind}"]`), `${d.lesson.slug}: ${kind}`).toHaveCount(blocks.filter((b) => b.kind === kind).length);
      }
      for (const b of blocks.filter((b) => b.kind === "heading")) {
        await expect(article.getByRole("heading", { level: 2, name: String(b.content), exact: true }).first(), d.lesson.slug).toBeVisible();
      }
      // Every text block in full, in its own block, in draft order: paragraphs, callouts (label and
      // text) and every checklist item, so a truncated warning or a dropped referral line fails.
      const nth = (kind: string, i: number) => article.locator(`[data-block="${kind}"]`).nth(i);
      const seen: Record<string, number> = {};
      for (const b of blocks) {
        const i = (seen[b.kind] = (seen[b.kind] ?? -1) + 1);
        if (b.kind === "paragraph") await expect(nth("paragraph", i), d.lesson.slug).toContainText(String(b.content));
        if (b.kind === "callout") {
          const c = b.content as { label: string; text: string };
          await expect(nth("callout", i), d.lesson.slug).toContainText(c.label);
          await expect(nth("callout", i), d.lesson.slug).toContainText(c.text);
        }
        if (b.kind === "checklist") {
          const items = b.content as string[];
          const li = nth("checklist", i).locator("li");
          await expect(li, d.lesson.slug).toHaveCount(items.length);
          for (const [k, item] of items.entries()) await expect(li.nth(k), d.lesson.slug).toHaveText(item);
        }
      }

      // Science blocks carry the Science presentation and their own sources; practice blocks are labelled.
      const scienceBlocks = blocks.filter((b) => b.support === "science" && b.kind !== "diagram");
      const science = scienceBlocks.length;
      const practiceCount = blocks.filter((b) => b.support === "practice-based" && b.kind !== "diagram").length;
      const scienceSections = article.locator('section[data-support="science"]:not([data-block="diagram"])');
      const practiceSections = article.locator('section[data-support="practice-based"]:not([data-block="diagram"])');
      await expect(scienceSections, d.lesson.slug).toHaveCount(science);
      await expect(article.locator('section[data-support="science"][data-evidence]'), "no synthetic claim reads as withdrawn or unknown").toHaveCount(0);
      await expect(practiceSections, d.lesson.slug).toHaveCount(practiceCount);
      // Labels beside the content itself, not the legend at the top of the article.
      if (practiceCount > 0) await expect(practiceSections.getByText("Practice-based", { exact: true }).first()).toBeVisible();
      if (science > 0) await expect(scienceSections.getByText("Science", { exact: true }).first()).toBeVisible();
      // Each science block's sources open to its own synthetic claims, the source and its DOI link.
      for (const [k, b] of scienceBlocks.entries()) {
        const section = scienceSections.nth(k);
        await section.locator("summary", { hasText: "Show sources" }).click();
        const details = section.locator("details");
        for (const slot of b.claimIds ?? []) await expect(details, `${d.lesson.slug} ${slot}`).toContainText(world.claimStatement(slot));
        await expect(details).toContainText(`Synthetic review ${world.run}`);
        await expect(details.locator(`a[href="https://doi.org/${world.doi}"]`).first()).toBeVisible();
      }

      // Safety beside assessments: each checklist the draft follows with a stop-and-refer callout
      // is followed by it on the page, as the very next block. The count per lesson is pinned, so
      // a warning removed or moved in the draft fails here too.
      let pairs = 0;
      let checklist = -1;
      for (const [i, b] of blocks.entries()) {
        if (b.kind !== "checklist") continue;
        checklist += 1;
        const next = blocks[i + 1];
        if (next?.kind !== "callout" || (next.content as { label: string }).label !== "Stop and refer") continue;
        pairs += 1;
        const sibling = await nth("checklist", checklist).evaluate((el) => ({ kind: el.nextElementSibling?.getAttribute("data-block"), text: el.nextElementSibling?.textContent ?? "" }));
        expect(sibling.kind, `${d.lesson.slug}: stop rule after checklist ${checklist + 1}`).toBe("callout");
        expect(sibling.text).toContain("Stop and refer");
        expect(sibling.text).toContain((next.content as { text: string }).text.slice(0, 40));
      }
      expect(pairs, `${d.lesson.slug}: assessment and warning pairs`).toBe(REQUIRED_PAIRS[d.lesson.slug]);

      // Graded questions show the prompt and point to the module quiz; never the answer.
      for (const q of blocks.filter((b) => b.kind === "quiz" && b.support === "science")) {
        const c = q.content as { prompt: string; explanation: string };
        await expect(article).toContainText(c.prompt);
        await expect(article).not.toContainText(c.explanation);
      }

      await page.getByRole("button", { name: "Mark lesson complete" }).click();
      await expect(page.getByTestId("lesson-status")).toContainText("Saved.");
    }
    expect(world.completions(actors.trainer!, gym)).toHaveLength(8);
  });

  test("the module quiz: a failed attempt, then a pass, and the module completes", async ({ browser }) => {
    // Every lesson is done but there is no pass yet: the module is not complete.
    const overview = await signIn(browser, actors.trainer!, learnPath(gym, assignment));
    await expect(overview.getByTestId("module-status")).toHaveAttribute("data-complete", "false");
    const page = overview;
    await page.goto(learnPath(gym, assignment, "module/quiz"));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Module quiz");
    await expect(page.locator("fieldset[data-question]")).toHaveCount(questions.length);

    await answerAll(page, (q) => (q.answerIndex + 1) % q.options.length);
    await page.getByRole("button", { name: "Submit answers" }).click();
    await expect(page.getByTestId("quiz-result")).toContainText("Not passed yet.");
    await expect(page.getByTestId("quiz-result")).toContainText(`You got 0 of ${questions.length} correct.`);
    // A failed attempt does not complete the module.
    const check = await page.context().newPage();
    await check.goto(learnPath(gym, assignment));
    await expect(check.getByTestId("module-status")).toHaveAttribute("data-complete", "false");
    await check.close();

    await page.getByTestId("quiz-result").getByRole("button", { name: "Try again" }).click();
    await answerAll(page, (q) => q.answerIndex);
    await page.getByRole("button", { name: "Submit answers" }).click();
    await expect(page.getByTestId("quiz-result")).toContainText("Passed.");
    await expect(page.getByTestId("quiz-result")).toContainText(`You got ${questions.length} of ${questions.length} correct.`);
    expect(sql(`select count(*) from public.quiz_attempts where user_id = '${actors.trainer!.id}'`)).toBe("2");

    await page.goto(learnPath(gym, assignment));
    await expect(page.getByTestId("module-status")).toContainText("Module complete.");
    await expect(page.getByTestId("module-status")).toHaveAttribute("data-complete", "true");
  });

  test("completion persists in a fresh session", async ({ browser }) => {
    const fresh = await signIn(browser, actors.trainer!, learnPath(gym, assignment));
    await expect(fresh.getByTestId("module-status")).toContainText("Module complete.");
    await expect(fresh.getByTestId("module-status")).toContainText("Every lesson is done.");
    for (const d of drafts) {
      await fresh.goto(learnPath(gym, assignment, d.lesson.slug));
      await expect(fresh.getByTestId("lesson-status"), d.lesson.slug).toContainText(/Completed\.|Lesson complete/);
    }
  });
});

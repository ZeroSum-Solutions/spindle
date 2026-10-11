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
 * The assessments that must carry a stop-and-refer warning as the very next block, per lesson,
 * pinned by the assessment's first item and a line of its own warning. Pinned so that a warning
 * moved onto another checklist, or a checklist losing its warning, fails even if the count holds.
 */
const REQUIRED_PAIRS: Record<string, { assessment: string; warning: string }[]> = {
  "shoulder-anatomy": [
    { assessment: "Follow the collarbone out from the base of the neck to the bony point at the top of the shoulder (acromion).", warning: "After a fall or impact, an arm they cannot move or a shoulder that looks out of place: emergency, now." },
  ],
  "scapulohumeral-rhythm": [
    { assessment: "Stand behind the client. Ask first; a fitted top lets you see the shoulder blades without asking anyone to undress.", warning: "Pain that is getting worse: routine referral now; do not wait." },
  ],
  "mobility-and-stability": [
    { assessment: "Ask first: is this new, and does it hurt? If it is new, unexplained or painful, go to the stop-and-refer rules before any screen.", warning: "Pain that is getting worse: routine referral now; do not wait." },
  ],
  "screens-and-red-flags": [
    { assessment: "Start: the client stands relaxed, arms by the sides, in a top that lets you see the shoulder blades. Stand behind them.", warning: "A new inability to lift or move the arm themselves, without an injury: urgent, today." },
    { assessment: "Start: the client stands with the elbow at the side, bent to a right angle, thumb up.", warning: "Pain and weakness after an injury, while the arm still moves and looks normal: urgent, today." },
    { assessment: "Start: the client stands relaxed.", warning: "Pain that has not improved after 2 weeks: routine referral." },
  ],
  "correctives-and-activation": [
    { assessment: "Position: set up the stance or support you will use in the first lift. Easier version: support the back against a wall or bench.", warning: "A warm-up drill that hurts is not a warm-up: skip it." },
  ],
  "loading-the-shoulder": [
    { assessment: "Progression: push-up from a raised surface, then a lower surface, then the floor.", warning: "Pain at the bottom of a press means stop for the session, not push through." },
    { assessment: "Progression: supported row (chest on a bench), then an unsupported row, then heavier load.", warning: "Pins and needles that do not go away, or no feeling in the arm or shoulder: urgent, today." },
    { assessment: "Progression: landmine press, then half-kneeling single-arm press, then standing press.", warning: "A new inability to lift or move the arm themselves, without an injury: urgent, today." },
  ],
  "throwing-and-rotation": [
    { assessment: "Use one set-up every time: the athlete lies on their back, arm out to the side at shoulder height, elbow bent to a right angle, with a folded towel under the elbow so the upper arm is level.", warning: "Pins and needles that do not go away, or no feeling in the arm or shoulder: urgent, today." },
  ],
  "when-to-refer-out": [],
};

/**
 * SAFETY.md rule 5: every stop-and-refer box ends by pointing to the full rules. Lesson 4 lists the
 * tiers itself, so its pointer says so.
 */
const FULL_RULES = 'The full stop rules and referral tiers are in "When to refer out" (lesson 8).';
const STOP_POINTER: Record<string, string> = {
  "screens-and-red-flags": 'The referral tiers are listed above in this lesson; the full stop rules and tiers are in "When to refer out" (lesson 8).',
};

/** Lesson-specific text the published drafts must show, or must no longer show (rehearsal fixes, #33). */
const LESSON_PINS: Record<string, { shows: string[]; never: string[] }> = {
  "shoulder-anatomy": {
    shows: ["They include the trapezius, the serratus anterior, the rhomboids (major and minor), levator scapulae and pectoralis minor."],
    // The serratus attachment clause was removed: its source does not support it.
    never: ["The serratus anterior attaches"],
  },
  "when-to-refer-out": {
    shows: ["For the three urgent red flags below, Spindle's stop rule comes first"],
    never: [],
  },
};

/** SAFETY.md rule 6 in lesson 8: the practice-based "What you do first" box, then the three graded adverse-case questions. */
const ADVERSE_CASE_PROMPTS = [
  "Under the UK specialist pathway, what does shoulder pain in a child or adolescent need?",
  "Under the UK specialist pathway, what does a lump or swelling found when someone is assessed for shoulder pain need?",
  "Under the UK specialist pathway, what does shoulder pain with inflammation in several joints need?",
];

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
        const what = `${path} ${JSON.stringify(headers)}`;
        let res = await page.request.get(path, { headers, maxRedirects: 0 });
        if (headers.RSC && res.status() === 307) {
          // Next validates RSC requests (validateRSCRequestHeaders): without the `_rsc` cache-busting
          // parameter it answers 307 to the same path with that parameter. Follow exactly that one
          // redirect, and nothing else: a redirect anywhere else (sign-in, an error) still fails.
          const location = new URL(res.headers().location ?? "", "http://localhost");
          expect(location.pathname, `${what}: RSC redirect target`).toBe(path);
          expect(location.searchParams.has("_rsc"), `${what}: RSC redirect adds _rsc`).toBe(true);
          res = await page.request.get(`${location.pathname}${location.search}`, { headers, maxRedirects: 0 });
        }
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
      // A support label opens every run of same-support blocks (a block without support ends a
      // run), and only there: checked block by block, beside the content, never in the legend.
      const supported = article.locator("section[data-support]");
      let previous: string | null = null;
      let afterPlainDiagram = false;
      let k = 0;
      // Runs follow the blocks as published: a reviewed diagram (Sol R16) carries support too, so it
      // continues or starts a run. Until the player renders a reviewed diagram as a supported block
      // (with its own label), the diagram is a plain figure here: it moves the run on, but has no
      // section or label of its own to check.
      const diagramSections = await article.locator('section[data-support][data-block="diagram"]').count();
      for (const b of blocks.map((x) => (x.kind === "diagram" ? diagramBlock(x) : x))) {
        const support = "support" in b && b.support ? b.support : null;
        if (support === null) {
          previous = null;
          continue;
        }
        if (b.kind === "diagram" && diagramSections === 0) {
          // Known gap on main: the run this diagram opens has no visible label. The block right after
          // it is exempt from the chip check either way; the gap is pinned as an expected failure below.
          previous = support;
          afterPlainDiagram = true;
          continue;
        }
        const label = support === "science" ? "Science" : "Practice-based";
        const chip = supported.nth(k).getByText(label, { exact: true });
        if (afterPlainDiagram) afterPlainDiagram = false;
        else if (support !== previous) await expect(chip, `${d.lesson.slug}: label at block ${k + 1}`).toBeVisible();
        else await expect(chip, `${d.lesson.slug}: no repeated label at block ${k + 1}`).toHaveCount(0);
        previous = support;
        k += 1;
      }
      await expect(supported).toHaveCount(k);
      // Each science block's sources open to its own synthetic claims, the source and its DOI link.
      for (const [k, b] of scienceBlocks.entries()) {
        const section = scienceSections.nth(k);
        await section.locator("summary", { hasText: "Show sources" }).click();
        const details = section.locator("details");
        for (const slot of b.claimIds ?? []) await expect(details, `${d.lesson.slug} ${slot}`).toContainText(world.claimStatement(slot));
        await expect(details).toContainText(`Synthetic review ${world.run}`);
        await expect(details.locator(`a[href="https://doi.org/${world.doi}"]`).first()).toBeVisible();
      }

      // Safety beside assessments: every pinned assessment is on the page, and the very next block
      // is a stop-and-refer callout carrying its own warning line. The draft must agree with the pins.
      const required = REQUIRED_PAIRS[d.lesson.slug]!;
      const draftPairs = blocks.flatMap((b, i) => {
        const next = blocks[i + 1];
        return b.kind === "checklist" && next?.kind === "callout" && (next.content as { label: string }).label === "Stop and refer"
          ? [{ assessment: (b.content as string[])[0]!, warning: (next.content as { text: string }).text }]
          : [];
      });
      expect(draftPairs.map((p) => p.assessment), `${d.lesson.slug}: assessments with a stop rule`).toEqual(required.map((r) => r.assessment));
      for (const pin of required) {
        const firstItems = await article.locator('[data-block="checklist"]').evaluateAll((els) => els.map((el) => el.querySelector("li")?.textContent ?? ""));
        const at = firstItems.indexOf(pin.assessment);
        expect(at, `${d.lesson.slug}: assessment "${pin.assessment.slice(0, 40)}"`).toBeGreaterThanOrEqual(0);
        const sibling = await nth("checklist", at).evaluate((el) => ({ kind: el.nextElementSibling?.getAttribute("data-block"), text: el.nextElementSibling?.textContent ?? "" }));
        expect(sibling.kind, `${d.lesson.slug}: stop rule after "${pin.assessment.slice(0, 40)}"`).toBe("callout");
        expect(sibling.text).toContain("Stop and refer");
        expect(sibling.text).toContain(pin.warning);
      }

      // Rule 5: every stop-and-refer box ends with its pointer to the full rules.
      const stopTexts = await article.locator('[data-block="callout"]').filter({ hasText: "Stop and refer" }).allTextContents();
      const draftStops = blocks.filter((b) => b.kind === "callout" && (b.content as { label: string }).label === "Stop and refer");
      expect(stopTexts.length, `${d.lesson.slug}: stop boxes`).toBe(draftStops.length);
      for (const text of stopTexts) expect(text.trim().endsWith(STOP_POINTER[d.lesson.slug] ?? FULL_RULES), `${d.lesson.slug}: rule-5 pointer`).toBe(true);

      const pins = LESSON_PINS[d.lesson.slug];
      for (const text of pins?.shows ?? []) await expect(article, d.lesson.slug).toContainText(text);
      for (const text of pins?.never ?? []) await expect(article, d.lesson.slug).not.toContainText(text);

      if (d.lesson.slug === "when-to-refer-out") {
        // In document order: the "What you do first" box, then exactly the three adverse-case questions.
        const order = await article.locator("[data-block]").evaluateAll((els) => els.map((el) => ({ kind: el.getAttribute("data-block"), text: el.textContent ?? "" })));
        const at = order.findIndex((b) => b.kind === "callout" && b.text.includes("What you do first"));
        expect(at, "lesson 8: What you do first").toBeGreaterThanOrEqual(0);
        const after = order.slice(at + 1, at + 1 + ADVERSE_CASE_PROMPTS.length);
        expect(after.map((b) => b.kind)).toEqual(ADVERSE_CASE_PROMPTS.map(() => "quiz"));
        ADVERSE_CASE_PROMPTS.forEach((prompt, i) => expect(after[i]!.text).toContain(prompt));
      }

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

  test("a support run opened by a reviewed diagram shows its label (expected to fail until diagrams render as supported blocks)", async ({ browser }) => {
    // Known bug on main after #23: a reviewed diagram carries support and opens a run, but renders
    // as a plain figure with no label, so the run shows none. The diagrams PR renders it as a
    // supported block with its own label; this test then passes unexpectedly and must be flipped.
    test.fail(true, "reviewed diagrams render without their run's support label until the diagrams PR lands");
    const page = await signIn(browser, actors.trainer!, learnPath(gym, assignment));
    for (const d of drafts) {
      const opens = d.lesson.blocks.some((b, i) => b.kind === "diagram" && !("support" in (d.lesson.blocks[i - 1] ?? {})));
      if (!opens) continue;
      await page.goto(learnPath(gym, assignment, d.lesson.slug));
      const diagram = page.locator("article").first().locator('[data-block="diagram"]').first();
      await expect(diagram.getByText(/^(Science|Practice-based)$/), `${d.lesson.slug}: the diagram's run label`).toBeVisible({ timeout: 2_000 });
    }
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

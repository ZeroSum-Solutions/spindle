import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { courseJson, PlayerWorld, practice, sql, type Actor, type LessonSpec } from "./player-fixtures";
import { learnPath, signIn } from "./helpers/sign-in";

// Graded module quiz and module completion (ADR 0007) against the real stack: the database
// scores every attempt and works out completion; the app only submits answers and shows
// what the server decided. Synthetic actors and content only.

const world = new PlayerWorld();
const actors: Record<string, Actor & { client: SupabaseClient }> = {};
let gymA: { id: string; slug: string };
let gymB: { id: string; slug: string };
let claimId: string;
const ids = { course: randomUUID(), part: randomUUID(), l: [randomUUID(), randomUUID()], plain: randomUUID(), plainPart: randomUUID(), plainLesson: randomUUID() };
const assignments: Record<string, string> = {};

// Two graded questions, one per lesson: a pass needs both (80% of 2 rounds up to 2).
const Q1 = { prompt: "Synthetic graded question one?", options: ["Synthetic one A", "Synthetic one B"], answerIndex: 1, explanation: "Synthetic explanation one." };
const Q2 = { prompt: "Synthetic graded question two?", options: ["Synthetic two A", "Synthetic two B", "Synthetic two C"], answerIndex: 0, explanation: "Synthetic explanation two." };
const graded = (content: typeof Q1) => ({ kind: "quiz", content, support: "science", claimIds: [claimId] });
const lesson = (i: number, title: string, quiz: typeof Q1): LessonSpec => ({ id: ids.l[i]!, slug: `quiz-lesson-${i + 1}`, title, blocks: [practice(`Synthetic text ${i}.`), graded(quiz)] });
const QID = (i: number) => `${ids.l[i]}:q1`;
const RIGHT = [
  { questionId: QID(0), answerIndex: 1 },
  { questionId: QID(1), answerIndex: 0 },
];

const quizPath = (who = "learner") => learnPath(gymA, assignments[who], "quiz");
const attempts = (who: string) => sql(`select count(*) from public.quiz_attempts where user_id = '${actors[who]!.id}'`);

async function answer(page: Page, choices: string[]) {
  for (const c of choices) await page.getByLabel(c, { exact: true }).check();
}

test.describe.serial("graded module quiz", () => {
  test.beforeAll(async () => {
    test.setTimeout(180_000);
    world.publisher();
    for (const name of ["qowner", "learner", "second", "outsider", "plain"]) actors[name] = await world.actor(name);
    gymA = world.gym("qa", actors.qowner!);
    gymB = world.gym("qb", actors.outsider!);
    for (const m of ["learner", "second", "plain"]) world.join(gymA, actors.qowner!, actors[m]!);
    [claimId] = world.claim();
    const version = world.publishGlobal(courseJson(ids.course, ids.part, "base", "Synthetic quiz course", [lesson(0, "Synthetic quiz lesson one", Q1), lesson(1, "Synthetic quiz lesson two", Q2)]));
    for (const who of ["learner", "second"]) assignments[who] = world.assign(gymA, actors.qowner!, version, actors[who]!);
    const plain = world.publishGlobal(
      courseJson(ids.plain, ids.plainPart, "base", "Synthetic course without a quiz", [{ id: ids.plainLesson, slug: "plain-lesson", title: "Synthetic plain lesson", blocks: [practice("Synthetic plain text.")] }]),
    );
    assignments.plain = world.assign(gymA, actors.qowner!, plain, actors.plain!);
  });

  test.afterAll(async () => {
    await world.cleanup();
  });

  test("a failed attempt, then a pass: the server scores both and says what a pass needs", async ({ browser }) => {
    const page = await signIn(browser, actors.learner!, quizPath());
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Module quiz");
    await expect(page.getByTestId("module-status")).toContainText("Quiz not taken yet: 2 questions, 2 correct to pass.");
    // The answer key never reaches the page before submitting.
    expect(await page.content()).not.toContain("Synthetic explanation");

    await answer(page, ["Synthetic one B", "Synthetic two C"]);
    await page.getByRole("button", { name: "Submit answers" }).click();
    const result = page.getByTestId("quiz-result");
    await expect(result).toContainText("Not passed yet.");
    await expect(result).toContainText("You got 1 of 2 correct.");
    await expect(result).toContainText("You need 2 to pass.");
    await expect(page.locator(`fieldset[data-question="${QID(0)}"]`)).toContainText("Correct. Synthetic explanation one.");
    await expect(page.locator(`fieldset[data-question="${QID(1)}"]`)).toContainText("Not quite. Synthetic explanation two.");

    await result.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByLabel("Synthetic two C", { exact: true })).not.toBeChecked();
    await answer(page, ["Synthetic one B", "Synthetic two A"]);
    await page.getByRole("button", { name: "Submit answers" }).click();
    await expect(page.getByTestId("quiz-result")).toContainText("Passed.");
    await expect(page.getByTestId("quiz-result")).toContainText("You got 2 of 2 correct.");
    expect(attempts("learner")).toBe("2");
    expect(sql(`select bool_or(passed)::text from public.quiz_attempts where user_id = '${actors.learner!.id}'`)).toBe("true");
  });

  test("a double submit counts once, and an attempt key cannot be reused for other answers", async ({ browser }) => {
    const page = await signIn(browser, actors.learner!, quizPath());
    const before = Number(attempts("learner"));
    await answer(page, ["Synthetic one A", "Synthetic two A"]);
    await page.getByRole("button", { name: "Submit answers" }).dblclick();
    await expect(page.getByTestId("quiz-result")).toContainText("1 of 2");
    expect(Number(attempts("learner"))).toBe(before + 1);

    // The same key twice through the RPC: the same attempt, not a second row.
    const key = randomUUID();
    const rpc = (answers: typeof RIGHT) => actors.learner!.client.rpc("submit_quiz_attempt", { p_assignment: assignments.learner, p_attempt_key: key, p_answers: answers });
    const first = await rpc(RIGHT);
    const again = await rpc(RIGHT);
    expect(first.error).toBeNull();
    expect(again.data).toEqual(first.data);
    expect(Number(attempts("learner"))).toBe(before + 2);
    const changed = await rpc([RIGHT[0]!, { questionId: QID(1), answerIndex: 2 }]);
    expect(changed.error?.code).toBe("22023");
    expect(changed.error?.message).toContain("attemptKey");
  });

  test("the module completes only with every lesson and a pass, and stays complete in a fresh session", async ({ browser }) => {
    const second = actors.second!;
    const overview = learnPath(gymA, assignments.second);
    // A pass first: the module is still not complete while a lesson is open.
    const pass = await second.client.rpc("submit_quiz_attempt", { p_assignment: assignments.second, p_attempt_key: randomUUID(), p_answers: RIGHT });
    expect(pass.error).toBeNull();
    const complete = (i: number) => second.client.rpc("complete_lesson", { p_assignment: assignments.second, p_lesson: ids.l[i] });
    expect((await complete(0)).error).toBeNull();
    const page = await signIn(browser, second, overview);
    const status = page.getByTestId("module-status");
    await expect(status).toContainText("Module not complete yet.");
    await expect(status).toContainText("1 of 2 lessons done.");
    await expect(status).toContainText("Quiz passed: your best attempt was 2 of 2.");
    await expect(status.getByRole("link", { name: "Take the module quiz" })).toHaveCount(0);

    expect((await complete(1)).error).toBeNull();
    await page.reload();
    await expect(page.getByTestId("module-status")).toContainText("Module complete.");
    await expect(page.getByTestId("module-status")).toHaveAttribute("data-complete", "true");

    const fresh = await signIn(browser, second, overview);
    await expect(fresh.getByTestId("module-status")).toContainText("Module complete.");
    await expect(fresh.getByTestId("module-status")).toContainText("2 of 2 lessons done.");
    const { data, error } = await second.client.rpc("module_status", { p_assignment: assignments.second });
    expect(error).toBeNull();
    expect((data as { complete: boolean }[])[0]?.complete).toBe(true);
  });

  test("forged scores, forged ids and foreign callers change nothing", async ({ browser }) => {
    // A form that also carries a forged score and another assignment: the bound action reads only the answers.
    const page = await signIn(browser, actors.learner!, quizPath());
    const before = Number(attempts("learner"));
    await answer(page, ["Synthetic one A", "Synthetic two B"]);
    await page.locator("form").first().evaluate(
      (form, forged) => {
        for (const [name, value] of Object.entries(forged)) {
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = name;
          input.value = value;
          form.appendChild(input);
        }
      },
      { passed: "true", correct: "2", total: "2", assignmentId: assignments.second!, gym: gymB.slug },
    );
    await page.getByRole("button", { name: "Submit answers" }).click();
    await expect(page.getByTestId("quiz-result")).toContainText("Not passed yet.");
    await expect(page.getByTestId("quiz-result")).toContainText("You got 0 of 2 correct.");
    expect(Number(attempts("learner"))).toBe(before + 1);
    expect(sql(`select passed::text from public.quiz_attempts where user_id = '${actors.learner!.id}' order by submitted_at desc limit 1`)).toBe("false");
    expect(sql(`select count(*) from public.quiz_attempts where user_id = '${actors.second!.id}' and correct = 0`)).toBe("0");

    // Malformed answers are refused by the database with nothing saved.
    const learner = actors.learner!.client;
    for (const answers of [[RIGHT[0]!], [...RIGHT, { questionId: `${ids.l[0]}:q9`, answerIndex: 0 }], [RIGHT[0]!, { questionId: QID(1), answerIndex: 7 }], [...RIGHT, RIGHT[0]!]]) {
      const { error } = await learner.rpc("submit_quiz_attempt", { p_assignment: assignments.learner, p_attempt_key: randomUUID(), p_answers: answers });
      expect(error?.code, JSON.stringify(answers)).toBe("22023");
    }
    expect(Number(attempts("learner"))).toBe(before + 1);

    // Someone else's assignment: another gym's member, and the gym's own owner, cannot submit for the learner.
    for (const who of ["outsider", "qowner"]) {
      const { error } = await actors[who]!.client.rpc("submit_quiz_attempt", { p_assignment: assignments.learner, p_attempt_key: randomUUID(), p_answers: RIGHT });
      expect(error?.code, who).toBe("P0002");
    }
    expect((await actors.outsider!.client.rpc("module_status", { p_assignment: assignments.learner })).error?.code).toBe("P0002");
    expect(Number(attempts("learner"))).toBe(before + 1);

    // The quiz page of someone else's assignment is not found.
    const outsider = await signIn(browser, actors.outsider!, learnPath(gymB));
    await outsider.goto(quizPath());
    await expect(outsider.getByText(/could not be found/i)).toBeVisible();
  });

  test("a version without graded questions says so and offers no quiz", async ({ browser }) => {
    const page = await signIn(browser, actors.plain!, learnPath(gymA, assignments.plain));
    await expect(page.getByTestId("module-status")).toContainText("This version has no graded quiz.");
    await expect(page.getByRole("link", { name: /Take the module quiz/ })).toHaveCount(0);
    await page.goto(learnPath(gymA, assignments.plain, "quiz"));
    await expect(page.getByText("This course version has no graded quiz.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit answers" })).toHaveCount(0);
  });
});

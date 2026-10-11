import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { courseJson, PlayerWorld, practice, sql, type Actor } from "./player-fixtures";
import { learnPath, signIn } from "./helpers/sign-in";

// T17 claim lifecycle after publication, in a real published lesson. Synthetic content only.
// 1. The claim's approval runs out (24 months): the block keeps its Science presentation and
//    shows "Evidence due for recheck".
// 2. The claim is then rejected: the block loses the Science presentation and shows "Claim
//    withdrawn"; the text, its sources and the review history stay.
// The steps share one test, so the withdrawal step cannot run without the expiry before it.

const world = new PlayerWorld();
const actors: Record<string, Actor> = {};
let gym: { id: string; slug: string };
let claimId: string;
let assignment: string;
const LESSON = "lifecycle";

test.describe.serial("claim lifecycle after publication", () => {
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    world.publisher();
    for (const name of ["lowner", "llearner"]) {
      const a = await world.actor(name);
      actors[name] = { email: a.email, id: a.id };
    }
    gym = world.gym("l", actors.lowner!);
    world.join(gym, actors.lowner!, actors.llearner!);
    [claimId] = world.claim();
    const version = world.publishGlobal(
      courseJson(randomUUID(), randomUUID(), "base", "Synthetic lifecycle course", [
        {
          id: randomUUID(),
          slug: LESSON,
          title: "Synthetic lifecycle lesson",
          blocks: [{ kind: "paragraph", content: "Synthetic lifecycle science.", support: "science", claimIds: [claimId] }, practice("Synthetic practice.")],
        },
      ]),
    );
    assignment = world.assign(gym, actors.lowner!, version, actors.llearner!);
  });

  test.afterAll(async () => {
    await world.cleanup();
  });

  const science = (page: import("@playwright/test").Page) => page.locator('[data-block="paragraph"]').filter({ hasText: "Synthetic lifecycle science." });

  // One test with three steps: each step depends on the state the previous one left.
  test("a published claim goes from current to recheck-due to withdrawn; text, sources and history stay", async ({ browser }) => {
    test.setTimeout(120_000); // three real sign-ins
    await test.step("a current claim presents as science", async () => {
      const page = await signIn(browser, actors.llearner!, learnPath(gym, assignment, LESSON));
      await expect(science(page)).toHaveAttribute("data-support", "science");
      await expect(science(page)).not.toHaveAttribute("data-evidence", /./);
      await expect(science(page).getByText("Science", { exact: true })).toBeVisible();
      await page.context().close();
    });

    await test.step("an expired approval keeps the Science presentation and flags the evidence for recheck", async () => {
      world.expire(claimId);
      const page = await signIn(browser, actors.llearner!, learnPath(gym, assignment, LESSON));
      await expect(science(page)).toHaveAttribute("data-evidence", "recheck-due");
      await expect(science(page).getByText("Evidence due for recheck")).toBeVisible();
      await expect(science(page).getByText("Science", { exact: true })).toBeVisible();
      await page.context().close();
    });

    await test.step("a claim rejected after publication loses the Science presentation and says so", async () => {
      world.withdraw(claimId);
      const page = await signIn(browser, actors.llearner!, learnPath(gym, assignment, LESSON));
      await expect(science(page)).toHaveAttribute("data-evidence", "withdrawn");
      await expect(science(page).getByText("Claim withdrawn")).toBeVisible();
      await expect(science(page).getByText("Science", { exact: true })).toHaveCount(0);
      await expect(science(page)).toContainText("no longer presented as science");
      // The text stays, its sources stay readable, and so does every review.
      await expect(science(page)).toContainText("Synthetic lifecycle science.");
      await science(page).getByText("Show sources").click();
      await expect(science(page).getByText(/^Synthetic claim .+\.$/)).toBeVisible();
      await expect(science(page).getByText(/^Synthetic review /)).toBeVisible();
      expect(sql(`select string_agg(decision, ',' order by seq) from public.claim_reviews where claim_id = '${claimId}'`)).toBe("approved,approved,rejected");
      await page.context().close();
    });
  });
});

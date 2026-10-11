import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { courseJson, PlayerWorld, practice, sql, type Actor } from "./player-fixtures";
import { learnPath, signIn } from "./helpers/sign-in";

// T17 claim lifecycle after publication, in a real published lesson. Synthetic content only.
// 1. The claim's approval runs out (24 months): the block keeps its Science presentation and
//    shows "Evidence due for recheck".
// 2. The claim is then rejected: the block loses the Science presentation and shows "Claim
//    withdrawn"; the text and the review history stay.

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

  test("a current claim presents as science", async ({ browser }) => {
    const page = await signIn(browser, actors.llearner!, learnPath(gym, assignment, LESSON));
    await expect(science(page)).toHaveAttribute("data-support", "science");
    await expect(science(page)).not.toHaveAttribute("data-evidence", /./);
    await expect(science(page).getByText("Science", { exact: true })).toBeVisible();
  });

  test("an expired approval keeps the Science presentation and flags the evidence for recheck", async ({ browser }) => {
    world.expire(claimId);
    const page = await signIn(browser, actors.llearner!, learnPath(gym, assignment, LESSON));
    await expect(science(page)).toHaveAttribute("data-evidence", "recheck-due");
    await expect(science(page).getByText("Evidence due for recheck")).toBeVisible();
    await expect(science(page).getByText("Science", { exact: true })).toBeVisible();
  });

  test("a claim rejected after publication loses the Science presentation and says so; history is kept", async ({ browser }) => {
    world.withdraw(claimId);
    const page = await signIn(browser, actors.llearner!, learnPath(gym, assignment, LESSON));
    await expect(science(page)).toHaveAttribute("data-evidence", "withdrawn");
    await expect(science(page).getByText("Claim withdrawn")).toBeVisible();
    await expect(science(page).getByText("Science", { exact: true })).toHaveCount(0);
    await expect(science(page)).toContainText("no longer presented as science");
    // The text stays, and so does every review.
    await expect(science(page)).toContainText("Synthetic lifecycle science.");
    expect(sql(`select string_agg(decision, ',' order by seq) from public.claim_reviews where claim_id = '${claimId}'`)).toBe("approved,approved,rejected");
  });
});

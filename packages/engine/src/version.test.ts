import { describe, expect, it } from "vitest";
import type { LessonCompletion, VersionManifest } from "@spindle/schema";
import { carryForwardCredit, diffVersions, retireReviewItems } from "./index";

// Synthetic ids and hashes. Real hashes come from the database; the engine only compares them.
function manifest(versionId: string, lessons: Record<string, string>): VersionManifest {
  return { versionId, lessons: Object.entries(lessons).map(([lessonId, contentHash]) => ({ lessonId, contentHash })) };
}

function done(
  lessonId: string,
  contentHash: string,
  overrides: Partial<LessonCompletion> = {},
): LessonCompletion {
  return {
    id: `done-${lessonId}`,
    lessonId,
    versionId: "v1",
    contentHash,
    completedAt: "2026-10-01T00:00:00Z",
    originCompletionId: null,
    ...overrides,
  };
}

// v1 → v2: l1 unchanged, l2 edited, l3 removed, l4 added.
const v1 = manifest("v1", { l1: "h1", l2: "h2", l3: "h3" });
const v2 = manifest("v2", { l1: "h1", l2: "h2-edited", l4: "h4" });

describe("diffVersions", () => {
  it("splits lessons into unchanged, changed, added and removed", () => {
    expect(diffVersions(v1, v2)).toEqual({
      fromVersionId: "v1",
      toVersionId: "v2",
      unchanged: ["l1"],
      changed: ["l2"],
      added: ["l4"],
      removed: ["l3"],
    });
  });

  it("reports no changes for identical hashes under a new version id", () => {
    const delta = diffVersions(v1, manifest("v2", { l1: "h1", l2: "h2", l3: "h3" }));
    expect(delta.unchanged).toEqual(["l1", "l2", "l3"]);
    expect([...delta.changed, ...delta.added, ...delta.removed]).toEqual([]);
  });

  it("rejects comparing a version with itself and duplicate lessons", () => {
    expect(() => diffVersions(v1, v1)).toThrow(/same version/);
    const dup: VersionManifest = { versionId: "v2", lessons: [...v2.lessons, v2.lessons[0]!] };
    expect(() => diffVersions(v1, dup)).toThrow(/Duplicate lesson l1/);
  });
});

describe("carryForwardCredit", () => {
  it("carries unchanged credit for a partly completed learner and points at the original", () => {
    const result = carryForwardCredit(v1, v2, [done("l1", "h1")]);
    expect(result.carried).toEqual([{ lessonId: "l1", versionId: "v2", contentHash: "h1", originCompletionId: "done-l1" }]);
    expect(result.reopened).toEqual([]);
    expect(result.outstanding).toEqual(["l2", "l4"]);
    expect(result.complete).toBe(false);
  });

  it("reopens changed lessons for a learner who finished the whole course", () => {
    const all = [done("l1", "h1"), done("l2", "h2"), done("l3", "h3")];
    const result = carryForwardCredit(v1, v2, all);
    expect(result.carried.map((c) => c.lessonId)).toEqual(["l1"]);
    expect(result.reopened).toEqual(["l2"]);
    expect(result.outstanding).toEqual(["l2", "l4"]);
    expect(result.complete).toBe(false);
  });

  it("keeps a fully completed learner complete when nothing changed", () => {
    const same = manifest("v2", { l1: "h1", l2: "h2", l3: "h3" });
    const result = carryForwardCredit(v1, same, [done("l1", "h1"), done("l2", "h2"), done("l3", "h3")]);
    expect(result.carried).toHaveLength(3);
    expect(result.outstanding).toEqual([]);
    expect(result.complete).toBe(true);
  });

  it("gives no credit and reopens nothing for a learner who had not started", () => {
    const result = carryForwardCredit(v1, v2, []);
    expect(result.carried).toEqual([]);
    expect(result.reopened).toEqual([]);
    expect(result.outstanding).toEqual(["l1", "l2", "l4"]);
  });

  it("counts a duplicate completion once and keeps the earliest original", () => {
    const completions = [
      done("l1", "h1", { id: "done-b", completedAt: "2026-10-02T00:00:00Z" }),
      done("l1", "h1", { id: "done-a", completedAt: "2026-10-01T00:00:00Z" }),
      done("l1", "h1", { id: "done-b", completedAt: "2026-10-02T00:00:00Z" }),
    ];
    const result = carryForwardCredit(v1, v2, completions);
    expect(result.carried).toEqual([{ lessonId: "l1", versionId: "v2", contentHash: "h1", originCompletionId: "done-a" }]);
    expect(carryForwardCredit(v1, v2, [...completions].reverse())).toEqual(result);
  });

  it("breaks a same-moment tie on completion id, not input order", () => {
    const a = done("l1", "h1", { id: "done-a" });
    const b = done("l1", "h1", { id: "done-b" });
    expect(carryForwardCredit(v1, v2, [b, a]).carried[0]?.originCompletionId).toBe("done-a");
  });

  it("points at the root completion, never a chain, across several versions", () => {
    const v3 = manifest("v3", { l1: "h1", l4: "h4" });
    const carriedIntoV2 = done("l1", "h1", { id: "done-v2", versionId: "v2", originCompletionId: "done-l1" });
    const result = carryForwardCredit(v2, v3, [done("l1", "h1"), carriedIntoV2]);
    expect(result.carried).toEqual([{ lessonId: "l1", versionId: "v3", contentHash: "h1", originCompletionId: "done-l1" }]);
  });

  it("credits a lesson that returns to an earlier hash the learner completed", () => {
    const v3 = manifest("v3", { l1: "h1", l2: "h2", l4: "h4" });
    const result = carryForwardCredit(v2, v3, [done("l2", "h2")]);
    expect(result.carried).toEqual([{ lessonId: "l2", versionId: "v3", contentHash: "h2", originCompletionId: "done-l2" }]);
  });

  it("is idempotent: credit already in the new version is not carried again", () => {
    const first = carryForwardCredit(v1, v2, [done("l1", "h1")]);
    const persisted = first.carried.map((c) => done(c.lessonId, c.contentHash, { id: "row-1", ...c }));
    const again = carryForwardCredit(v1, v2, [done("l1", "h1"), ...persisted]);
    expect(again.carried).toEqual([]);
    expect(again.outstanding).toEqual(first.outstanding);
  });

  it("does not modify its inputs", () => {
    const completions = [done("l1", "h1")];
    const snapshot = JSON.parse(JSON.stringify({ v1, v2, completions }));
    carryForwardCredit(v1, v2, completions);
    expect({ v1, v2, completions }).toEqual(snapshot);
  });

  it("rejects completions that contradict the previous version", () => {
    expect(() => carryForwardCredit(v1, v2, [done("l9", "h9")])).toThrow(/not in v1/);
    expect(() => carryForwardCredit(v1, v2, [done("l1", "stale")])).toThrow(/hash/);
  });

  it("rejects completions in the new version whose hash differs from it", () => {
    expect(() => carryForwardCredit(v1, v2, [done("l2", "h2", { versionId: "v2" })])).toThrow(/hash/);
  });
});

describe("retireReviewItems", () => {
  it("retires review items for removed lessons only", () => {
    const delta = diffVersions(v1, v2);
    const items = [
      { id: "r1", lessonId: "l1" },
      { id: "r2", lessonId: "l2" },
      { id: "r3", lessonId: "l3" },
      { id: "r4", lessonId: "l3" },
    ];
    expect(retireReviewItems(delta, items)).toEqual({
      kept: [items[0], items[1]],
      retired: [items[2], items[3]],
    });
  });
});

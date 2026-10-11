import { describe, expect, it } from "vitest";
import { carryForwardCredit } from "@spindle/engine";
import type { Course, LessonBlock } from "@spindle/schema";
import {
  byCourse,
  groupByPart,
  completionsFrom,
  courseView,
  previousVersion,
  publishedVersion,
  VersionUnavailableError,
  type CompletionRow,
  type ManifestRow,
  type VersionRow,
} from "./view";

// Synthetic ids and hashes only. Real hashes come from the database.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const hash = (c: string) => c.repeat(64);
const [L1, L2, L3, L4] = [id(11), id(12), id(13), id(14)];
const [V1, V2, V3] = [id(1), id(2), id(3)];
const CLAIM = id(90);

function lesson(lessonId: string, title: string, blocks: LessonBlock[] = []) {
  return {
    id: lessonId,
    slug: title.toLowerCase().replace(/\s+/g, "-"),
    title,
    summary: "Synthetic.",
    durationMinutes: 5,
    format: "article" as const,
    objectives: [],
    anatomyIds: [],
    blocks,
    media: [],
    resources: [],
  };
}

function course(lessons: ReturnType<typeof lesson>[], layer: Course["layer"] = "base"): Course {
  return {
    id: id(100),
    slug: "synthetic-course",
    layer,
    title: "Synthetic course",
    subtitle: "Test only",
    description: "Synthetic.",
    level: "foundation",
    outcomes: [],
    parts: [{ id: id(200), ordinal: 1, title: "Part one", summary: "", lessons }],
  };
}

const science: LessonBlock = { kind: "paragraph", content: "Synthetic claim text.", support: "science", claimIds: [CLAIM] };

function version(versionId: string, n: number, lessons: [string, string, string][], layer: Course["layer"] = "base") {
  const row: VersionRow = {
    id: versionId,
    version_number: n,
    layer,
    org_id: layer === "method" ? id(500) : null,
    snapshot: course(lessons.map(([lid, title]) => lesson(lid, title, lid === L1 ? [science] : [])), layer),
  };
  const manifest: ManifestRow[] = lessons.map(([lid, , h], i) => ({ lesson_id: lid, ordinal: i + 1, content_hash: h }));
  return publishedVersion(row, manifest);
}

// v1 → v2: L1 unchanged, L2 edited, L3 removed, L4 added. v3 keeps L1 again.
const v1 = version(V1, 1, [[L1, "One", hash("a")], [L2, "Two", hash("b")], [L3, "Three", hash("c")]]);
const v2 = version(V2, 2, [[L1, "One", hash("a")], [L2, "Two revised", hash("d")], [L4, "Four", hash("e")]]);
const v3 = version(V3, 3, [[L1, "One", hash("a")], [L4, "Four", hash("e")]]);
const numbers = new Map([[V1, 1], [V2, 2], [V3, 3]]);

function row(n: number, versionId: string, lessonId: string, h: string, at: string, origin: string | null = null): CompletionRow {
  return { id: id(n), version_id: versionId, lesson_id: lessonId, content_hash: h, completed_at: at, origin_completion_id: origin };
}

describe("publishedVersion", () => {
  it("orders the manifest by ordinal", () => {
    const v = publishedVersion({ id: V1, version_number: 1, layer: "base", org_id: null, snapshot: course([lesson(L1, "One"), lesson(L2, "Two")]) }, [
      { lesson_id: L2, ordinal: 2, content_hash: hash("b") },
      { lesson_id: L1, ordinal: 1, content_hash: hash("a") },
    ]);
    expect(v.manifest.lessons.map((l) => l.lessonId)).toEqual([L1, L2]);
  });

  it.each([
    ["a snapshot that fails ingress", { snapshot: { ...course([lesson(L1, "One")]), extra: true } }, [[L1, 1]]],
    ["a manifest missing a lesson", {}, [[L1, 1]]],
    ["a manifest with an extra lesson", {}, [[L1, 1], [L2, 2], [L3, 3]]],
    ["a different lesson set", {}, [[L1, 1], [L3, 2]]],
    ["a layer that differs from the row", { layer: "modality" }, [[L1, 1], [L2, 2]]],
    ["method content without an owning gym", { layer: "method", snapshot: course([lesson(L1, "One"), lesson(L2, "Two")], "method") }, [[L1, 1], [L2, 2]]],
    ["a bad hash", {}, [[L1, 1, "nothex"], [L2, 2]]],
  ] as const)("refuses %s", (_label, overrides, lessons) => {
    const base: VersionRow = { id: V1, version_number: 1, layer: "base", org_id: null, snapshot: course([lesson(L1, "One"), lesson(L2, "Two")]) };
    const manifest = lessons.map(([lid, ordinal, h]) => ({ lesson_id: lid, ordinal, content_hash: h ?? hash("a") }));
    expect(() => publishedVersion({ ...base, ...overrides }, manifest)).toThrow(VersionUnavailableError);
  });
});

describe("courseView", () => {
  it("shows a fresh assignment as all to do, with continue on the first lesson", () => {
    const view = courseView({ current: v1, completions: [], versionNumbers: numbers, flaggedClaimIds: [] });
    expect(view.lessons.map((l) => l.state)).toEqual(["todo", "todo", "todo"]);
    expect(view).toMatchObject({ done: 0, total: 3, complete: false, delta: null, layer: "base", versionNumber: 1 });
    expect(view.next?.id).toBe(L1);
  });

  it("marks direct completions done and moves continue past them", () => {
    const completions = completionsFrom([row(1, V1, L1, hash("a"), "2026-10-01T10:00:00.123456+00:00")]);
    const view = courseView({ current: v1, completions, versionNumbers: numbers, flaggedClaimIds: [] });
    expect(view.lessons[0]).toMatchObject({ state: "done", completedAt: "2026-10-01T10:00:00.123456+00:00" });
    expect(view.done).toBe(1);
    expect(view.next?.id).toBe(L2);
  });

  it("partial learner in v2: carried credit names the original version, changed and added lessons open", () => {
    const completions = completionsFrom([
      row(1, V1, L1, hash("a"), "2026-10-01T10:00:00+00:00"),
      row(2, V2, L1, hash("a"), "2026-10-05T10:00:00+00:00", id(1)),
    ]);
    const view = courseView({ current: v2, previous: v1, completions, versionNumbers: numbers, flaggedClaimIds: [] });
    expect(view.lessons.map((l) => [l.title, l.state])).toEqual([["One", "credited"], ["Two revised", "todo"], ["Four", "new"]]);
    expect(view.lessons[0]!.origin).toEqual({ completedAt: "2026-10-01T10:00:00+00:00", versionNumber: 1 });
    expect(view.delta).toEqual({ fromVersionNumber: 1, changed: ["Two revised"], added: ["Four"], removed: ["Three"] });
    expect(view).toMatchObject({ done: 1, total: 3, complete: false });
  });

  it("full learner in v2: the changed lesson reopens as updated and the course is not complete", () => {
    const completions = completionsFrom([
      row(1, V1, L1, hash("a"), "2026-10-01T10:00:00+00:00"),
      row(2, V1, L2, hash("b"), "2026-10-01T11:00:00+00:00"),
      row(3, V1, L3, hash("c"), "2026-10-01T12:00:00+00:00"),
      row(4, V2, L1, hash("a"), "2026-10-05T10:00:00+00:00", id(1)),
    ]);
    const inV2 = courseView({ current: v2, previous: v1, completions, versionNumbers: numbers, flaggedClaimIds: [] });
    expect(inV2.lessons.map((l) => l.state)).toEqual(["credited", "updated", "new"]);
    expect(inV2.complete).toBe(false);
    const inV1 = courseView({ current: v1, completions, versionNumbers: numbers, flaggedClaimIds: [] });
    expect(inV1.complete).toBe(true);
    expect(inV1.next).toBeNull();
  });

  it("does not reopen a lesson in an older version because a newer version was completed", () => {
    const completions = completionsFrom([row(5, V2, L2, hash("d"), "2026-10-06T10:00:00+00:00")]);
    const inV1 = courseView({ current: v1, completions, versionNumbers: numbers, flaggedClaimIds: [] });
    expect(inV1.lessons.map((l) => l.state)).toEqual(["todo", "todo", "todo"]);
  });

  it("keeps root lineage in v3: credit points at the v1 completion, not the v2 copy", () => {
    const completions = completionsFrom([
      row(1, V1, L1, hash("a"), "2026-10-01T10:00:00+00:00"),
      row(2, V2, L1, hash("a"), "2026-10-05T10:00:00+00:00", id(1)),
      row(3, V3, L1, hash("a"), "2026-10-07T10:00:00+00:00", id(1)),
    ]);
    const view = courseView({ current: v3, previous: v2, completions, versionNumbers: numbers, flaggedClaimIds: [] });
    expect(view.lessons[0]).toMatchObject({ state: "credited", origin: { versionNumber: 1, completedAt: "2026-10-01T10:00:00+00:00" } });
  });

  it("says the origin version is unknown rather than guessing when it is not visible", () => {
    const completions = completionsFrom([row(2, V2, L1, hash("a"), "2026-10-05T10:00:00+00:00", id(1))]);
    const view = courseView({ current: v2, completions, versionNumbers: numbers, flaggedClaimIds: [] });
    expect(view.lessons[0]).toMatchObject({ state: "credited", origin: { versionNumber: null } });
  });

  it("flags lessons whose blocks cite a retracted claim and keeps credit", () => {
    const completions = completionsFrom([row(1, V1, L1, hash("a"), "2026-10-01T10:00:00+00:00")]);
    const view = courseView({ current: v1, completions, versionNumbers: numbers, flaggedClaimIds: [CLAIM] });
    expect(view.lessons.map((l) => l.flagged)).toEqual([true, false, false]);
    expect(view.lessons[0]!.state).toBe("done");
    expect(view.flaggedClaimIds).toEqual([CLAIM]);
  });

  it("agrees with the engine about which lessons the database carried", () => {
    // Database rows after assigning v2 to the full learner: only L1 is carried.
    const before = completionsFrom([
      row(1, V1, L1, hash("a"), "2026-10-01T10:00:00+00:00"),
      row(2, V1, L2, hash("b"), "2026-10-01T11:00:00+00:00"),
      row(3, V1, L3, hash("c"), "2026-10-01T12:00:00+00:00"),
    ]);
    const engine = carryForwardCredit(v1.manifest, v2.manifest, before);
    const carriedRows = [row(4, V2, L1, hash("a"), "2026-10-05T10:00:00+00:00", id(1))];
    expect(carriedRows.map((r) => ({ lessonId: r.lesson_id, versionId: r.version_id, contentHash: r.content_hash, originCompletionId: r.origin_completion_id }))).toEqual(engine.carried);
    const view = courseView({ current: v2, previous: v1, completions: [...before, ...completionsFrom(carriedRows)], versionNumbers: numbers, flaggedClaimIds: [] });
    expect(view.lessons.filter((l) => l.state === "updated").map((l) => l.id)).toEqual(engine.reopened);
  });
});

describe("previousVersion", () => {
  it("picks the latest older assigned version", () => {
    expect(previousVersion(v3, [v1, v2, v3])?.id).toBe(V2);
    expect(previousVersion(v1, [v1, v2])).toBeUndefined();
  });
});

describe("byCourse", () => {
  it("leads each course with its newest version and keeps course order", () => {
    const items = [
      { id: "a1", courseId: "c1", versionNumber: 1 },
      { id: "m1", courseId: "m", versionNumber: 1 },
      { id: "a3", courseId: "c1", versionNumber: 3 },
      { id: "a2", courseId: "c1", versionNumber: 2 },
    ];
    expect(byCourse(items).map((g) => [g.latest.id, g.earlier.map((e) => e.id)])).toEqual([
      ["a3", ["a2", "a1"]],
      ["m1", []],
    ]);
  });
});

describe("groupByPart", () => {
  it("keeps parts with the same title apart, in snapshot order", () => {
    const twoParts: Course = {
      ...course([]),
      parts: [
        { id: id(201), ordinal: 1, title: "Review", summary: "", lessons: [lesson(L1, "One")] },
        { id: id(202), ordinal: 2, title: "Practice", summary: "", lessons: [lesson(L2, "Two")] },
        { id: id(203), ordinal: 3, title: "Review", summary: "", lessons: [lesson(L3, "Three")] },
      ],
    };
    const v = publishedVersion({ id: V1, version_number: 1, layer: "base", org_id: null, snapshot: twoParts }, [
      { lesson_id: L1, ordinal: 1, content_hash: hash("a") },
      { lesson_id: L2, ordinal: 2, content_hash: hash("b") },
      { lesson_id: L3, ordinal: 3, content_hash: hash("c") },
    ]);
    const view = courseView({ current: v, completions: [], versionNumbers: numbers, flaggedClaimIds: [] });
    expect(groupByPart(view.lessons).map((p) => [p.title, p.lessons.map((l) => l.title)])).toEqual([
      ["Review", ["One"]],
      ["Practice", ["Two"]],
      ["Review", ["Three"]],
    ]);
  });
});

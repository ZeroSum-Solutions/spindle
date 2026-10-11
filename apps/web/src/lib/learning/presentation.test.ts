import { describe, expect, it } from "vitest";
import type { LessonBlock } from "@spindle/schema";
import { receiptLine, supportLabelPlan } from "./presentation";

const P = (t: string): LessonBlock => ({ kind: "paragraph", content: t, support: "practice-based", claimIds: [] });
const S = (t: string): LessonBlock => ({ kind: "paragraph", content: t, support: "science", claimIds: ["c1"] });
const H = (t: string): LessonBlock => ({ kind: "heading", content: t });

describe("supportLabelPlan", () => {
  it("labels only the first block of each run of the same support", () => {
    expect(supportLabelPlan([S("a"), P("b"), P("c"), P("d"), S("e"), S("f")])).toEqual([true, true, false, false, true, false]);
  });

  it("starts a new run after a heading, image or diagram", () => {
    expect(supportLabelPlan([P("a"), H("h"), P("b"), { kind: "diagram", content: { diagramId: "x", caption: "" } }, P("c")])).toEqual([true, false, true, false, true]);
  });

  it("never labels a block without support", () => {
    expect(supportLabelPlan([H("h")])).toEqual([false]);
  });
});

describe("receiptLine", () => {
  it("says a completed lesson once: state, version and date", () => {
    const line = receiptLine({ state: "done", completedAt: "2026-10-11T10:00:00Z" }, 2);
    expect(line).toEqual({ lead: "Lesson complete", detail: "v2 · 11 Oct 2026" });
    expect(`${line!.lead} ${line!.detail}`.match(/complete/gi)).toHaveLength(1);
  });

  it("names carried credit and its origin", () => {
    expect(receiptLine({ state: "credited", completedAt: "2026-10-01T10:00:00Z", origin: { completedAt: "2026-10-01T10:00:00Z", versionNumber: 1 } }, 3)).toEqual({
      lead: "Credited",
      detail: "v3 · from your completion on 1 Oct 2026 in v1",
    });
    expect(receiptLine({ state: "credited", origin: { completedAt: "2026-10-01T10:00:00Z", versionNumber: null } }, 3)!.detail).toBe("v3 · from your completion on 1 Oct 2026");
  });

  it("has nothing to say for lessons not done", () => {
    expect(receiptLine({ state: "todo" }, 1)).toBeNull();
    expect(receiptLine({ state: "updated" }, 1)).toBeNull();
  });
});

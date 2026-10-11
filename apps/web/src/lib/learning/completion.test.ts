import { describe, expect, it } from "vitest";
import { savedMessage, savedState } from "./completion";

describe("completion receipt", () => {
  it("reports a direct completion as saved for its version", () => {
    const state = savedState(1, { completed_at: "2026-10-01T10:00:00+00:00", origin_completion_id: null }, null);
    expect(state.status === "saved" && savedMessage(state)).toEqual({ lead: "Saved.", text: "Lesson completed for v1 on 1 Oct 2026." });
  });

  it("stale v2 tab after completing in v1: says credited from v1, not completed in v2", () => {
    // Tab A (v1) completes the lesson; the database carries credit into the v2 assignment
    // with origin = the v1 row. Tab B, opened on v2 before that, then submits: the RPC
    // returns the existing v2 row, which is carried credit.
    const v2Row = { completed_at: "2026-10-01T10:00:00.5+00:00", origin_completion_id: "root" };
    const v1Root = { completed_at: "2026-10-01T10:00:00+00:00", versionNumber: 1 };
    const state = savedState(2, v2Row, v1Root);
    expect(state).toMatchObject({ status: "saved", versionNumber: 2, credit: { versionNumber: 1, completedAt: v1Root.completed_at } });
    expect(state.status === "saved" && savedMessage(state)).toEqual({
      lead: "Credited.",
      text: "This lesson already counts for v2 through your completion on 1 Oct 2026 in v1.",
    });
  });

  it("does not guess the origin version when it is not visible", () => {
    const state = savedState(3, { completed_at: "2026-10-05T10:00:00+00:00", origin_completion_id: "root" }, null);
    expect(state.status === "saved" && savedMessage(state).text).toBe("This lesson already counts for v3 through your completion on 5 Oct 2026.");
  });
});

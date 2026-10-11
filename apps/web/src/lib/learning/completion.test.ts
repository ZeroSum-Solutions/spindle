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

  it("never shows the carry date when the root completion could not be read", () => {
    // Root done on 1 Oct, credit carried on 9 Oct; the origin read failed.
    const state = savedState(2, { completed_at: "2026-10-09T10:00:00+00:00", origin_completion_id: "root" }, null);
    expect(state).toMatchObject({ status: "saved", credit: { completedAt: null, versionNumber: null } });
    const message = state.status === "saved" ? savedMessage(state) : null;
    expect(message).toEqual({ lead: "Credited.", text: "This lesson already counts for v2 through an earlier completion." });
    expect(message?.text).not.toContain("9 Oct 2026");
  });

  it("names the root's date, not the carry date, when the root is read", () => {
    const state = savedState(2, { completed_at: "2026-10-09T10:00:00+00:00", origin_completion_id: "root" }, { completed_at: "2026-10-01T10:00:00+00:00", versionNumber: null });
    const text = state.status === "saved" ? savedMessage(state).text : "";
    expect(text).toBe("This lesson already counts for v2 through your completion on 1 Oct 2026.");
    expect(text).not.toContain("9 Oct 2026");
  });
});

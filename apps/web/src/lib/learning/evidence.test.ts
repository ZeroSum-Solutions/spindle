import { describe, expect, it } from "vitest";
import type { ClaimIntegrityState } from "@spindle/schema";
import { evidenceView } from "./evidence";

const states = (entries: [string, ClaimIntegrityState][]) => new Map(entries);
const none = new Set<string>();

describe("evidenceView", () => {
  it("presents current claims as science", () => {
    expect(evidenceView(["c1"], none, states([["c1", "current"]]))).toEqual({ presentsAsScience: true, withdrawn: false, retracted: false, recheckDue: false, statusUnknown: false });
  });

  it("removes the science presentation when any cited claim is withdrawn", () => {
    expect(evidenceView(["c1", "c2"], none, states([["c1", "current"], ["c2", "withdrawn"]]))).toMatchObject({ presentsAsScience: false, withdrawn: true });
  });

  it("fails closed for a claim the report does not mention", () => {
    expect(evidenceView(["c1"], none, states([]))).toMatchObject({ presentsAsScience: false, withdrawn: true });
  });

  it("keeps science but flags an expired approval for recheck", () => {
    expect(evidenceView(["c1"], none, states([["c1", "recheck_due"]]))).toMatchObject({ presentsAsScience: true, recheckDue: true, withdrawn: false });
  });

  it("marks retraction from either the report or the existing flags", () => {
    expect(evidenceView(["c1"], none, states([["c1", "retracted"]])).retracted).toBe(true);
    expect(evidenceView(["c1"], new Set(["c1"]), states([["c1", "current"]])).retracted).toBe(true);
  });

  it("fails closed when the report could not be read: no Science presentation, and no claim of withdrawal", () => {
    expect(evidenceView(["c1"], none, null)).toEqual({ presentsAsScience: false, withdrawn: false, retracted: false, recheckDue: false, statusUnknown: true });
    expect(evidenceView(["c1"], new Set(["c1"]), null).retracted).toBe(true);
  });
});

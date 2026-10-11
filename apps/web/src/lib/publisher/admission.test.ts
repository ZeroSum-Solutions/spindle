import { describe, expect, it } from "vitest";
import { parseDecision } from "./admission";

const ID = "00000000-0000-4000-8000-0000000000d1";
const HASH = "a".repeat(64);
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

describe("parseDecision", () => {
  it("accepts an admit with the reviewed hash, and gives it a fixed reason when none is typed", () => {
    expect(parseDecision(form({ textId: ID, textHash: HASH, decision: "admitted", reason: "" }))).toEqual({
      ok: true,
      value: { textId: ID, textHash: HASH, decision: "admitted", reason: "Admitted on the publisher admission screen." },
    });
  });

  it("requires a reason to reject", () => {
    expect(parseDecision(form({ textId: ID, textHash: HASH, decision: "rejected", reason: " " }))).toEqual({ ok: false, error: "Give a reason to reject." });
    expect(parseDecision(form({ textId: ID, textHash: HASH, decision: "rejected", reason: "Reads as a claim." }))).toMatchObject({ ok: true, value: { reason: "Reads as a claim." } });
  });

  it("refuses a malformed id, hash, decision or an over-long reason", () => {
    expect(parseDecision(form({ textId: "x", textHash: HASH, decision: "admitted", reason: "" })).ok).toBe(false);
    expect(parseDecision(form({ textId: ID, textHash: "abc", decision: "admitted", reason: "" })).ok).toBe(false);
    expect(parseDecision(form({ textId: ID, textHash: HASH, decision: "revoked", reason: "x" })).ok).toBe(false);
    expect(parseDecision(form({ textId: ID, textHash: HASH, decision: "rejected", reason: "x".repeat(501) })).ok).toBe(false);
  });
});

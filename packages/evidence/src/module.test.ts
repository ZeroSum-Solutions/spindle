// Module orchestration (docs/curriculum/PUBLISHING.md), with every database and file effect mocked.
import { describe, expect, it } from "vitest";
import {
  bindCourse,
  collectSlots,
  excerptAction,
  loadDrafts,
  syncClaims,
  type ClaimDeps,
  type ClaimState,
  type ModuleMeta,
  type Slot,
  slotSchema,
} from "./module";

const slot = (id: string, statement = `Statement ${id}.`, sources: { doi?: string; pmid?: string }[] = [{ doi: "10.5555/a" }]): Slot => slotSchema.parse({
  slot: `claim-slot:${id}`,
  statement,
  domain: "applied",
  evidenceLevel: "Synthetic level",
  population: "Synthetic population",
  candidateSources: sources,
});
const lesson = (id: string, slots: string[]) => ({
  id,
  slug: id,
  title: id,
  summary: "",
  durationMinutes: 5,
  format: "article",
  objectives: [],
  anatomyIds: [],
  media: [],
  resources: [],
  blocks: slots.map((s) => ({ kind: "paragraph", content: "x", support: "science", claimIds: [`claim-slot:${s}`] })),
});
const draft = (name: string, id: string, slots: Slot[]) => ({ name, json: { lesson: lesson(id, slots.map((s) => s.slot.slice(11))), claimSlots: slots } });

/** In-memory publisher: sources by DOI or PMID, claims by id, every write logged. */
function fakeDb(sources: Record<string, { doi?: string; pmid?: string }> = { S1: { doi: "10.5555/a", pmid: "11" }, S2: { pmid: "22" } }) {
  const claims = new Map<string, { body: unknown }>();
  const checkpoints: ClaimState[] = [];
  let next = 0;
  let failAt = -1;
  const deps: ClaimDeps = {
    resolve: (c) => {
      const hit = Object.entries(sources).find(([, s]) => (c.doi ? s.doi === c.doi.toLowerCase() && (!c.pmid || !s.pmid || s.pmid === c.pmid) : !!c.pmid && s.pmid === c.pmid));
      return hit ? hit[0] : null;
    },
    claimExists: (id) => claims.has(id),
    findIdentical: (body) => [...claims.entries()].find(([, c]) => JSON.stringify(c.body) === JSON.stringify(body))?.[0] ?? null,
    addClaim: (body) => {
      if (next === failAt) throw new Error("synthetic RPC failure");
      const id = `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}`;
      claims.set(id, { body });
      return id;
    },
    checkpoint: (s) => checkpoints.push(structuredClone(s)),
  };
  return { deps, claims, checkpoints, failAfter: (n: number) => (failAt = n) };
}

describe("drafts and slots", () => {
  it("refuses two drafts with the same lesson number (W3)", () => {
    expect(() => loadDrafts([draft("01-a.json", "a", [slot("x")]), draft("01-b.json", "b", [slot("y")])])).toThrow(/two drafts numbered 01/);
  });

  it("refuses conflicting definitions of one slot across lessons, before any write (W2)", () => {
    const drafts = loadDrafts([draft("01-a.json", "a", [slot("x", "One.")]), draft("02-b.json", "b", [slot("x", "Two.")])]);
    expect(() => collectSlots(drafts)).toThrow(/claim-slot:x is defined differently/);
    const same = loadDrafts([draft("01-a.json", "a", [slot("x")]), draft("02-b.json", "b", [slot("x")])]);
    expect(collectSlots(same).size).toBe(1);
  });
});

describe("syncClaims", () => {
  it("creates one claim per slot and checkpoints after each (W4)", () => {
    const db = fakeDb();
    const out = syncClaims(new Map([["claim-slot:x", slot("x")], ["claim-slot:y", slot("y")]]), {}, db.deps);
    expect(out.blocked).toEqual([]);
    expect(Object.keys(out.state)).toEqual(["claim-slot:x", "claim-slot:y"]);
    expect(db.checkpoints).toHaveLength(2);
    expect(Object.keys(db.checkpoints[0]!)).toEqual(["claim-slot:x"]);
  });

  it("recovers a claim committed before an interrupted checkpoint instead of duplicating it (W4)", () => {
    const db = fakeDb();
    db.failAfter(1);
    const slots = new Map([["claim-slot:x", slot("x")], ["claim-slot:y", slot("y")]]);
    expect(() => syncClaims(slots, {}, db.deps)).toThrow(/synthetic RPC failure/);
    const saved = db.checkpoints.at(-1)!;
    db.failAfter(-1);
    // The checkpoint for x was lost too: recovery must find the identical committed claim.
    const out = syncClaims(slots, {}, db.deps);
    expect(out.state["claim-slot:x"]!.claimId).toBe(saved["claim-slot:x"]!.claimId);
    expect(db.claims.size).toBe(2);
  });

  it("reuses an unchanged claim and makes a new one when the slot changes", () => {
    const db = fakeDb();
    const first = syncClaims(new Map([["claim-slot:x", slot("x", "Old.")]]), {}, db.deps).state;
    const same = syncClaims(new Map([["claim-slot:x", slot("x", "Old.")]]), first, db.deps).state;
    expect(same["claim-slot:x"]!.claimId).toBe(first["claim-slot:x"]!.claimId);
    const changed = syncClaims(new Map([["claim-slot:x", slot("x", "New.")]]), first, db.deps).state;
    expect(changed["claim-slot:x"]!.claimId).not.toBe(first["claim-slot:x"]!.claimId);
  });

  it("drops the mapping of a slot whose sources are missing, so it cannot be bound stale (BLOCK)", () => {
    const db = fakeDb();
    const first = syncClaims(new Map([["claim-slot:x", slot("x")]]), {}, db.deps).state;
    const out = syncClaims(new Map([["claim-slot:x", slot("x", "Changed.", [{ doi: "10.5555/missing" }])]]), first, db.deps);
    expect(out.blocked).toEqual(["claim-slot:x"]);
    expect(out.state["claim-slot:x"]).toBeUndefined();
  });

  it("prunes slots that no draft defines any more (W5)", () => {
    const db = fakeDb();
    const first = syncClaims(new Map([["claim-slot:x", slot("x")], ["claim-slot:gone", slot("gone")]]), {}, db.deps).state;
    expect(Object.keys(syncClaims(new Map([["claim-slot:x", slot("x")]]), first, db.deps).state)).toEqual(["claim-slot:x"]);
  });

  it("resolves PMID-only candidates (W8)", () => {
    const db = fakeDb();
    const out = syncClaims(new Map([["claim-slot:p", slot("p", "PMID only.", [{ pmid: "22" }])]]), {}, db.deps);
    expect(out.blocked).toEqual([]);
  });

  it("refuses a DOI whose stored PMID differs (W7)", () => {
    const db = fakeDb();
    const out = syncClaims(new Map([["claim-slot:m", slot("m", "Mismatch.", [{ doi: "10.5555/a", pmid: "99" }])]]), {}, db.deps);
    expect(out.blocked).toEqual(["claim-slot:m"]);
  });
});

describe("bindCourse (BLOCK)", () => {
  const meta: ModuleMeta = {
    key: "m", slug: "m", layer: "base", title: "M", subtitle: "", description: "", level: "foundation", outcomes: [],
    parts: [{ key: "p", title: "P", summary: "", lessons: ["01"] }],
  };

  it("binds current mappings with stable ids", () => {
    const db = fakeDb();
    const drafts = loadDrafts([draft("01-a.json", "a", [slot("x")])]);
    const slots = collectSlots(drafts);
    const { state } = syncClaims(slots, {}, db.deps);
    const course = bindCourse(meta, drafts, slots, state, db.deps) as { id: string; parts: { lessons: { blocks: { claimIds: string[] }[] }[] }[] };
    expect(course.parts[0]!.lessons[0]!.blocks[0]!.claimIds).toEqual([state["claim-slot:x"]!.claimId]);
    expect(bindCourse(meta, drafts, slots, state, db.deps)).toEqual(course);
  });

  it("refuses a mapping whose slot changed since the claims step, even if an id is stored", () => {
    const db = fakeDb();
    const before = loadDrafts([draft("01-a.json", "a", [slot("x", "Old.")])]);
    const { state } = syncClaims(collectSlots(before), {}, db.deps);
    const after = loadDrafts([draft("01-a.json", "a", [slot("x", "New.")])]);
    expect(() => bindCourse(meta, after, collectSlots(after), state, db.deps)).toThrow(/claim-slot:x changed since the claims step/);
  });

  it("refuses an unmapped slot", () => {
    const db = fakeDb();
    const drafts = loadDrafts([draft("01-a.json", "a", [slot("x")])]);
    expect(() => bindCourse(meta, drafts, collectSlots(drafts), {}, db.deps)).toThrow(/no current claim for claim-slot:x/);
  });
});

describe("excerptAction (W6)", () => {
  const spec = { locator: "p. 4", attribution: "Synthetic, 2025." };
  const stored = { origin: "publisher-excerpt" as const, locator: "p. 4", text: "Exact words here.", attribution: "Synthetic, 2025." };
  it("adds a new excerpt, reuses only an identical one and refuses a different one at the same locator", () => {
    expect(excerptAction([], spec, "Exact words here.")).toBe("add");
    expect(excerptAction([stored], spec, "  Exact   words here.\n")).toBe("reuse");
    expect(excerptAction([stored], spec, "Different words.")).toMatch(/differs from the stored excerpt/);
    expect(excerptAction([stored], { ...spec, attribution: "Other." }, "Exact words here.")).toMatch(/differs from the stored excerpt/);
    expect(excerptAction([stored], spec, null)).toMatch(/file is missing/);
  });
});

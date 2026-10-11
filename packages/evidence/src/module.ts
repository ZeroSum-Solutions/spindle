// Module orchestration logic (docs/curriculum/PUBLISHING.md), import-safe: every database and file
// effect is injected, so the binding rules are tested without I/O. scripts/module.ts wires them up.
// No rule here replaces the database gate; these checks stop stale or ambiguous drafts earlier.
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Excerpt } from "./fulltext";

/** Stable ids, so a re-run (and the final shared publish) addresses the same course, parts and lessons. */
const NAMESPACE = "6f1c2c0e-1d3a-4c55-9a37-5b1e0d4a7c21";
export function uuidV5(name: string, namespace = NAMESPACE): string {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const h = createHash("sha1").update(Buffer.concat([ns, Buffer.from(name, "utf8")])).digest();
  h[6] = (h[6]! & 0x0f) | 0x50;
  h[8] = (h[8]! & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

const candidateSchema = z
  .object({ doi: z.string().min(1).optional(), pmid: z.union([z.string().regex(/^\d{1,9}$/), z.number().int().positive()]).optional() })
  .refine((c) => c.doi !== undefined || c.pmid !== undefined, "a candidate source needs a DOI or a PMID")
  .transform((c) => ({ ...(c.doi ? { doi: c.doi.toLowerCase() } : {}), ...(c.pmid !== undefined ? { pmid: String(c.pmid) } : {}) }));

export const slotSchema = z.object({
  slot: z.string().startsWith("claim-slot:"),
  statement: z.string().min(1),
  domain: z.enum(["foundation", "applied"]),
  evidenceLevel: z.string().min(1).max(100),
  population: z.string().min(1).max(500),
  candidateSources: z.array(candidateSchema).min(1),
});
export type SlotDef = z.input<typeof slotSchema>;
export type Slot = z.output<typeof slotSchema>;
export type Candidate = z.output<typeof candidateSchema>;

const draftSchema = z.object({ lesson: z.object({ id: z.string().min(1), blocks: z.array(z.unknown()) }).passthrough(), claimSlots: z.array(slotSchema) });
export interface LoadedDraft {
  number: string;
  name: string;
  lesson: { id: string; blocks: unknown[] } & Record<string, unknown>;
  slots: Slot[];
}

/** Drafts named NN-*.json, one per lesson number (Sol R1 #32 W3). */
export function loadDrafts(files: readonly { name: string; json: unknown }[]): LoadedDraft[] {
  const out: LoadedDraft[] = [];
  const seen = new Map<string, string>();
  for (const f of [...files].filter((x) => /^\d{2}-.*\.json$/.test(x.name)).sort((a, b) => a.name.localeCompare(b.name))) {
    const number = f.name.slice(0, 2);
    const other = seen.get(number);
    if (other) throw new Error(`two drafts numbered ${number}: ${other} and ${f.name}`);
    seen.set(number, f.name);
    const d = draftSchema.parse(f.json);
    out.push({ number, name: f.name, lesson: d.lesson as LoadedDraft["lesson"], slots: d.claimSlots });
  }
  return out;
}

const canonical = (s: Slot) =>
  JSON.stringify({ statement: s.statement, domain: s.domain, evidenceLevel: s.evidenceLevel, population: s.population, sources: s.candidateSources });

/** Every slot the drafts define. A slot defined differently in two places is refused before any write (W2). */
export function collectSlots(drafts: readonly LoadedDraft[]): Map<string, Slot> {
  const slots = new Map<string, Slot>();
  for (const d of drafts) {
    for (const s of d.slots) {
      const known = slots.get(s.slot);
      if (known && canonical(known) !== canonical(s)) throw new Error(`${s.slot} is defined differently in two lessons; define it once`);
      slots.set(s.slot, s);
    }
  }
  return slots;
}

export type ClaimState = Record<string, { claimId: string; fingerprint: string }>;
export interface ClaimBody {
  statement: string;
  evidenceLevel: string;
  population: string;
  domain: "foundation" | "applied";
  sourceIds: string[];
}

export interface ClaimDeps {
  /** The ingested source for a candidate, matched by DOI (and its PMID, when given) or by PMID alone; null if absent or mismatched. */
  resolve(c: Candidate): string | null;
  /** True only for a claim this publisher owns whose stored body and source set equal `body` (Sol R2 W2). */
  claimMatches(id: string, body: ClaimBody): boolean;
  /** A claim already committed with exactly this body (recovers an interrupted run without duplicates). */
  findIdentical(body: ClaimBody): string | null;
  addClaim(body: ClaimBody): string;
  /** Persists the state after each claim (W4). */
  checkpoint(state: ClaimState): void;
}

/** The claim body and fingerprint for a slot as the drafts define it now, or null when a source is not ingested. */
export function slotBody(s: Slot, deps: Pick<ClaimDeps, "resolve">): { body: ClaimBody; fingerprint: string } | null {
  const ids = s.candidateSources.map((c) => deps.resolve(c));
  if (ids.some((i) => !i)) return null;
  const body: ClaimBody = { statement: s.statement, evidenceLevel: s.evidenceLevel, population: s.population, domain: s.domain, sourceIds: [...new Set(ids as string[])].sort() };
  return { body, fingerprint: createHash("sha256").update(JSON.stringify(body)).digest("hex") };
}

/**
 * One claim per current slot. State is rebuilt from the current slots only (deleted slots drop out, W5),
 * a blocked slot loses its mapping so it can never be bound stale (BLOCK), and each new or reused claim
 * is checkpointed at once (W4).
 */
export function syncClaims(slots: ReadonlyMap<string, Slot>, previous: ClaimState, deps: ClaimDeps): { state: ClaimState; blocked: string[] } {
  const state: ClaimState = {};
  const blocked: string[] = [];
  for (const [id, s] of slots) {
    const current = slotBody(s, deps);
    if (!current) {
      blocked.push(id);
      continue;
    }
    const known = previous[id];
    let claimId: string;
    if (known && known.fingerprint === current.fingerprint && deps.claimMatches(known.claimId, current.body)) claimId = known.claimId;
    else claimId = deps.findIdentical(current.body) ?? deps.addClaim(current.body);
    state[id] = { claimId, fingerprint: current.fingerprint };
    deps.checkpoint(state);
  }
  // Nothing written yet (every slot blocked or none left): still drop the old mappings.
  if (Object.keys(state).length === 0) deps.checkpoint(state);
  return { state, blocked };
}

/** The claim ids to review: each once, even when two slots share one claim (Sol R2 W3). */
export function reviewIds(state: ClaimState): string[] {
  return [...new Set(Object.values(state).map((c) => c.claimId))];
}

/** Where a state file was written: the publisher and database it describes. */
export interface StateContext {
  publisher: string;
  target: string;
}

/** The state file: its context and the slot→claim map. */
export function moduleStateText(context: StateContext, claims: ClaimState): string {
  return `${JSON.stringify({ publisher: context.publisher, target: context.target, claims }, null, 2)}\n`;
}

/**
 * Reads a state file for this publisher and database. A corrupt file, or one written for another
 * publisher or database, is refused (Sol R2 W1, W2). Moving it aside is safe: the claims step then
 * recovers this publisher's identical claims instead of creating duplicates.
 */
export function readModuleState(text: string | null, context: StateContext): ClaimState {
  if (text === null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("the claims state file is unreadable (an interrupted write?); move it aside and run the claims step again: it recovers identical claims without duplicating them");
  }
  const st = z
    .strictObject({ publisher: z.string(), target: z.string(), claims: z.record(z.string(), z.strictObject({ claimId: z.string().min(1), fingerprint: z.string() })) })
    .safeParse(parsed);
  if (!st.success) throw new Error("the claims state file has an unknown shape; move it aside and run the claims step again");
  if (st.data.publisher !== context.publisher || st.data.target !== context.target) {
    throw new Error("the claims state file was written for another publisher or database; use a separate SPINDLE_MODULE_STATE_DIR per publisher and database");
  }
  return st.data.claims;
}

/** Writes a file atomically: a temporary file in the same directory, then a rename (Sol R2 W1). */
export function atomicWrite(path: string, text: string, fs: { writeFileSync(p: string, t: string, o?: unknown): void; renameSync(a: string, b: string): void }): void {
  const tmp = `${path}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text, { mode: 0o600 });
  fs.renameSync(tmp, path);
}

export const moduleSchema = z.strictObject({
  key: z.string().regex(/^[a-z0-9-]+$/),
  slug: z.string().min(1),
  layer: z.literal("base"),
  title: z.string().min(1),
  subtitle: z.string(),
  description: z.string(),
  level: z.enum(["foundation", "intermediate", "advanced"]),
  outcomes: z.array(z.string().min(1)),
  parts: z.array(z.strictObject({ key: z.string().min(1), title: z.string().min(1), summary: z.string(), lessons: z.array(z.string().regex(/^\d{2}$/)).min(1) })).min(1),
});
export type ModuleMeta = z.input<typeof moduleSchema>;

/**
 * The course tree to save. Every claim slot a block cites must have a mapping whose fingerprint equals
 * the slot as the drafts define it now; otherwise the claims step has not run since the change (BLOCK).
 */
export function bindCourse(metaInput: ModuleMeta, drafts: readonly LoadedDraft[], slots: ReadonlyMap<string, Slot>, state: ClaimState, deps: Pick<ClaimDeps, "resolve">): unknown {
  const m = moduleSchema.parse(metaInput);
  const byNumber = new Map(drafts.map((d) => [d.number, d]));
  const bind = (c: string) => {
    if (!c.startsWith("claim-slot:")) return c;
    const known = state[c];
    if (!known) throw new Error(`no current claim for ${c}; run the claims step (a blocked slot has none)`);
    const s = slots.get(c);
    const current = s ? slotBody(s, deps) : null;
    if (!current || current.fingerprint !== known.fingerprint) throw new Error(`${c} changed since the claims step; run it again`);
    return known.claimId;
  };
  return {
    id: uuidV5(`course:${m.key}`),
    slug: m.slug,
    layer: m.layer,
    title: m.title,
    subtitle: m.subtitle,
    description: m.description,
    level: m.level,
    outcomes: m.outcomes,
    parts: m.parts.map((part, i) => ({
      id: uuidV5(`part:${m.key}:${part.key}`),
      ordinal: i + 1,
      title: part.title,
      summary: part.summary,
      lessons: part.lessons.map((n) => {
        const d = byNumber.get(n);
        if (!d) throw new Error(`no draft numbered ${n}`);
        const { id, blocks, ...rest } = d.lesson;
        return {
          ...rest,
          id: uuidV5(`lesson:${m.key}:${id}`),
          blocks: blocks.map((b) => {
            const block = b as { claimIds?: string[] };
            // Two slots that share one claim bind it once (Sol R2 W3).
            return block.claimIds?.length ? { ...block, claimIds: [...new Set(block.claimIds.map(bind))] } : b;
          }),
        };
      }),
    })),
  };
}

const norm = (t: string) => t.replace(/\s+/g, " ").trim();

/**
 * What to do with a manifest excerpt: add it, reuse an identical stored one, or refuse (a message)
 * when the file is missing or the stored excerpt at that locator differs (W6). Replacing one means
 * removing it from the private evidence file, re-running, and reviewing again.
 */
export function excerptAction(existing: readonly Excerpt[], spec: { locator: string; attribution: string }, text: string | null): "add" | "reuse" | string {
  if (text === null) return `the excerpt file is missing from SPINDLE_EXCERPT_DIR (${spec.locator})`;
  const stored = existing.find((e) => e.origin === "publisher-excerpt" && e.locator === spec.locator);
  if (!stored) return "add";
  if (norm(stored.text) === norm(text) && (stored.attribution ?? "") === spec.attribution) return "reuse";
  return `the excerpt at ${spec.locator} differs from the stored excerpt; remove the stored one from the evidence file, run again, and review again`;
}

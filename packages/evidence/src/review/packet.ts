// Bounded review packets (plan section 7). A packet names every item the
// reviewer must answer, with the database hash it will be recorded against,
// and carries the evidence as data. Its digest is what the receipt records.
import { createHash } from "node:crypto";
import { z } from "zod";
import type { RetractionState } from "../retraction";

export const PACKET_VERSION = 1;
export const MAX_PACKET_BYTES = 400_000;
export const MAX_PACKET_ITEMS = 80;

export type ItemKind = "claim" | "block" | "lesson" | "course" | "segment";

export interface PacketItem {
  /** `<kind>:<target id>`, unique in the packet. */
  id: string;
  kind: ItemKind;
  /** The database id the receipt is recorded against. */
  target: string;
  /** The database-computed hash from publisher_claim_target / publisher_review_targets. */
  expectedHash: string;
  /** Sorted claim set (blocks and lessons). */
  claimIds?: string[];
  /** What the reviewer judges. Untrusted data. */
  content: unknown;
}

/** Source text a reviewer may read. Papers: the full abstract with matching identifiers. */
export interface EvidenceEntry {
  sourceId: string;
  kind: "systematic_review" | "meta_analysis" | "position_stand" | "textbook" | "nomenclature";
  title: string;
  identifiers: { doi?: string; pmid?: string; url?: string };
  /** The full abstract, open-access text or official entry. A drafter's summary is not evidence. */
  text: string;
  textOrigin: string;
  retraction: RetractionState;
  /** When existence and retraction status were last checked (ISO 8601). */
  checkedAt: string;
}

export interface ReviewPacket {
  version: typeof PACKET_VERSION;
  rubric: "claims" | "content" | "segments";
  createdAt: string;
  items: PacketItem[];
  evidence: EvidenceEntry[];
  /** The safety rules (docs/curriculum/SAFETY.md) a content review applies. */
  safetyRules?: string;
}

/** JSON with object keys sorted, so the digest does not depend on key order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
    return `{${entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function packetDigest(packet: ReviewPacket): string {
  return createHash("sha256").update(canonicalJson(packet)).digest("hex");
}

const HASH = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const uuid = z.string().regex(UUID);

export const evidenceEntrySchema = z.strictObject({
  sourceId: uuid,
  kind: z.enum(["systematic_review", "meta_analysis", "position_stand", "textbook", "nomenclature"]),
  title: z.string().min(1),
  identifiers: z.strictObject({ doi: z.string().optional(), pmid: z.string().optional(), url: z.string().optional() }),
  text: z.string().min(1),
  textOrigin: z.string().min(1),
  retraction: z.enum(["retracted", "not_retracted", "unknown"]),
  checkedAt: z.string(),
}) satisfies z.ZodType<EvidenceEntry>;

const claimContentSchema = z.strictObject({
  statement: z.string().min(1).max(2000),
  evidenceLevel: z.string().min(1),
  population: z.string().min(1),
  sourceIds: z.array(uuid).min(1).max(20),
});

const claimView = z.array(z.strictObject({ claimId: uuid, statement: z.string().min(1), population: z.string().min(1) }));
/** Content shape per item kind, as the builders produce it. */
const CONTENT_SCHEMAS: Partial<Record<ItemKind, z.ZodType>> = {
  claim: claimContentSchema,
  course: z.looseObject({ title: z.string().min(1), parts: z.array(z.unknown()) }),
  block: z.strictObject({ lessonId: uuid, ordinal: z.number().int().min(1), block: z.looseObject({ kind: z.string().min(1) }), claims: claimView }),
  lesson: z.strictObject({ lesson: z.looseObject({ id: z.string().min(1), blocks: z.array(z.unknown()) }), claims: claimView }),
};

/** The stored-packet boundary: every field, so a hand-edited or truncated packet fails before review or recording. */
const packetSchema = z.strictObject({
  version: z.literal(PACKET_VERSION),
  rubric: z.enum(["claims", "content", "segments"]),
  createdAt: z.iso.datetime({ offset: true }),
  items: z.array(
    z.strictObject({
      id: z.string().min(1).max(300),
      kind: z.enum(["claim", "block", "lesson", "course", "segment"]),
      target: uuid,
      expectedHash: z.string().regex(HASH),
      claimIds: z.array(uuid).max(1000).optional(),
      content: z.unknown(),
    }),
  ),
  evidence: z.array(evidenceEntrySchema),
  safetyRules: z.string().optional(),
});

/** Throws unless the packet is well formed and within bounds. */
export function assertPacket(packet: ReviewPacket): void {
  const fail = (m: string): never => {
    throw new Error(`Invalid review packet: ${m}`);
  };
  const shape = packetSchema.safeParse(packet);
  if (!shape.success) fail(shape.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  for (const item of packet.items) {
    const schema = CONTENT_SCHEMAS[item.kind];
    if (schema && !schema.safeParse(item.content).success) fail(`${item.kind} item ${item.id} has malformed content`);
  }
  if (packet.version !== PACKET_VERSION) fail(`version must be ${PACKET_VERSION}`);
  if (packet.items.length === 0) fail("it has no items");
  if (packet.items.length > MAX_PACKET_ITEMS) fail(`it has ${packet.items.length} items; the limit is ${MAX_PACKET_ITEMS}`);
  const ids = new Set<string>();
  for (const item of packet.items) {
    if (item.id !== `${item.kind}:${item.target}`) fail(`item ${item.id} must be named ${item.kind}:${item.target}`);
    if (ids.has(item.id)) fail(`item ${item.id} appears twice`);
    ids.add(item.id);
    if (!HASH.test(item.expectedHash)) fail(`item ${item.id} has no database hash`);
    if (packet.rubric === "claims" && item.kind !== "claim") fail(`a claims packet cannot hold ${item.id}`);
    if (packet.rubric === "content" && (item.kind === "claim" || item.kind === "segment")) fail(`a content packet cannot hold ${item.id}`);
    if (packet.rubric === "segments" && item.kind !== "segment") fail(`a segments packet cannot hold ${item.id}`);
  }
  if (packet.rubric !== "claims" && !packet.safetyRules?.trim()) fail(`a ${packet.rubric} review needs the safety rules`);
  for (const e of packet.evidence) {
    if (!e.text.trim()) fail(`evidence ${e.sourceId} has no text`);
  }
  const bytes = Buffer.byteLength(canonicalJson(packet), "utf8");
  if (bytes > MAX_PACKET_BYTES) fail(`it is ${bytes} bytes; the limit is ${MAX_PACKET_BYTES}`);
}

/** publisher_claim_target output. */
export interface ClaimTarget {
  claimId: string;
  hash: string;
  statement: string;
  evidenceLevel: string;
  population: string;
  sourceIds: string[];
  status: string;
}

/**
 * One packet for a set of claims. A claim goes in only when every source has
 * evidence text and is verified as not retracted; the others come back as
 * blocked (missing or incomplete evidence means it cannot be approved).
 */
/** Evidence checked longer ago than this must be re-ingested (existence and retraction) before a claim review. */
export const MAX_EVIDENCE_AGE_DAYS = 30;

/** The immutable identity of a database source (sources row). */
export interface SourceIdentity {
  doi: string | null;
  pmid: string | null;
  url?: string | null;
  kind: string;
}

/** Evidence counts for a source only when its kind and every identifier the source has match exactly. */
export function evidenceMatchesSource(e: EvidenceEntry, s: SourceIdentity | undefined): boolean {
  if (!s || e.kind !== s.kind) return false;
  if (!s.doi && !s.pmid && !s.url) return false;
  if (s.doi && (e.identifiers.doi ?? "").toLowerCase() !== s.doi.toLowerCase()) return false;
  if (s.pmid && e.identifiers.pmid !== s.pmid) return false;
  if (!s.doi && !s.pmid && s.url && e.identifiers.url !== s.url) return false;
  return true;
}

/** The recorder repeats the identity check against the database before it records anything. */
export function assertEvidenceMatchesSources(packet: ReviewPacket, sources: ReadonlyMap<string, SourceIdentity>): void {
  for (const e of packet.evidence) {
    if (!evidenceMatchesSource(e, sources.get(e.sourceId))) throw new Error(`evidence for ${e.sourceId} does not match the cited source`);
  }
}

export function buildClaimPacket(
  claims: readonly ClaimTarget[],
  evidence: ReadonlyMap<string, EvidenceEntry>,
  createdAt: string,
  sources: ReadonlyMap<string, SourceIdentity>,
): { packet: ReviewPacket | null; blocked: { claimId: string; reason: string }[] } {
  const oldest = Date.parse(createdAt) - MAX_EVIDENCE_AGE_DAYS * 86_400_000;
  const latest = Date.parse(createdAt) + 5 * 60_000;
  const blocked: { claimId: string; reason: string }[] = [];
  const items: PacketItem[] = [];
  const used = new Map<string, EvidenceEntry>();
  for (const c of claims) {
    const missing = c.sourceIds.filter((s) => !evidence.get(s)?.text.trim());
    const unsafe = c.sourceIds.filter((s) => evidence.get(s) && evidence.get(s)!.retraction !== "not_retracted");
    if (c.sourceIds.length === 0 || missing.length > 0) {
      blocked.push({ claimId: c.claimId, reason: `no evidence text for source ${missing.join(", ") || "(none)"}` });
      continue;
    }
    const mismatched = c.sourceIds.filter((s) => !evidenceMatchesSource(evidence.get(s)!, sources.get(s)));
    if (mismatched.length > 0) {
      blocked.push({ claimId: c.claimId, reason: `evidence for ${mismatched.join(", ")} does not match the cited source` });
      continue;
    }
    const odd = c.sourceIds.filter((s) => !(Date.parse(evidence.get(s)!.checkedAt) <= latest));
    if (odd.length > 0) {
      blocked.push({ claimId: c.claimId, reason: `source ${odd.join(", ")} has an unreadable or future check time` });
      continue;
    }
    const stale = c.sourceIds.filter((s) => !(Date.parse(evidence.get(s)!.checkedAt) >= oldest));
    if (stale.length > 0) {
      blocked.push({ claimId: c.claimId, reason: `source ${stale.join(", ")} was last checked over ${MAX_EVIDENCE_AGE_DAYS} days ago` });
      continue;
    }
    if (unsafe.length > 0) {
      blocked.push({ claimId: c.claimId, reason: `source ${unsafe.join(", ")} is retracted or its status is unknown` });
      continue;
    }
    for (const s of c.sourceIds) used.set(s, evidence.get(s)!);
    items.push({
      id: `claim:${c.claimId}`,
      kind: "claim",
      target: c.claimId,
      expectedHash: c.hash,
      content: { statement: c.statement, evidenceLevel: c.evidenceLevel, population: c.population, sourceIds: c.sourceIds },
    });
  }
  if (items.length === 0) return { packet: null, blocked };
  const packet: ReviewPacket = { version: PACKET_VERSION, rubric: "claims", createdAt, items, evidence: [...used.values()] };
  assertPacket(packet);
  return { packet, blocked };
}

/**
 * A claim review request is all or nothing: if any requested claim is blocked, no packet is built,
 * so no requested claim can silently drop out of the expected item set.
 */
export function requireCompleteClaimPacket(
  claims: readonly ClaimTarget[],
  evidence: ReadonlyMap<string, EvidenceEntry>,
  createdAt: string,
  sources: ReadonlyMap<string, SourceIdentity>,
): { packet: ReviewPacket | null; blocked: { claimId: string; reason: string }[] } {
  const built = buildClaimPacket(claims, evidence, createdAt, sources);
  return built.blocked.length > 0 ? { packet: null, blocked: built.blocked } : built;
}

/** publisher_review_targets output (see @spindle/schema ReviewTargets). */
export interface ContentTargets {
  courseId: string;
  course: { hash: string; shell: unknown };
  lessons: {
    lessonId: string;
    hash: string;
    claimIds: string[];
    lesson: { blocks?: unknown[] } & Record<string, unknown>;
    blocks: { blockId: string; ordinal: number; kind: string; support: string | null; hash: string; claimIds: string[] }[];
  }[];
}

/**
 * One packet for a course draft: the course text, every lesson, and every
 * claim-bound block, with the cited claims' statements (approved claims only
 * reach a draft that can publish).
 */
export function buildContentPacket(
  targets: ContentTargets,
  claims: ReadonlyMap<string, { statement: string; population: string }>,
  safetyRules: string,
  createdAt: string,
): ReviewPacket {
  const claimView = (ids: readonly string[]) =>
    ids.map((id) => {
      const c = claims.get(id);
      if (!c) throw new Error(`Invalid review packet: claim ${id} is cited but was not supplied`);
      return { claimId: id, statement: c.statement, population: c.population };
    });
  const items: PacketItem[] = [{ id: `course:${targets.courseId}`, kind: "course", target: targets.courseId, expectedHash: targets.course.hash, content: targets.course.shell }];
  for (const l of targets.lessons) {
    for (const b of l.blocks) {
      if (b.claimIds.length === 0) continue;
      const block = l.lesson.blocks?.[b.ordinal - 1] as { kind?: unknown } | undefined;
      if (!block || block.kind !== b.kind) {
        throw new Error(`Invalid review packet: lesson ${l.lessonId} has no ${b.kind} block ${b.ordinal} in its JSON`);
      }
      items.push({
        id: `block:${b.blockId}`,
        kind: "block",
        target: b.blockId,
        expectedHash: b.hash,
        claimIds: b.claimIds,
        content: { lessonId: l.lessonId, ordinal: b.ordinal, block, claims: claimView(b.claimIds) },
      });
    }
    items.push({
      id: `lesson:${l.lessonId}`,
      kind: "lesson",
      target: l.lessonId,
      expectedHash: l.hash,
      claimIds: l.claimIds,
      content: { lesson: l.lesson, claims: claimView(l.claimIds) },
    });
  }
  const packet: ReviewPacket = { version: PACKET_VERSION, rubric: "content", createdAt, items, evidence: [], safetyRules };
  assertPacket(packet);
  return packet;
}

/** What the trusted recorder needs about the describer run behind a segment item (D-11). */
export interface SegmentDescriber {
  run: { model: string; session: string; packetDigest: string; reviewedAt: string };
  costUsd: number;
}

/**
 * One packet for a registry clip: its frozen segment, the model description of
 * it (untrusted data, never instructions), the lessons that embed it and the
 * safety rules. The expected hash seals the frozen registry fields.
 */
export function buildSegmentPacket(
  segment: { mediaId: string; videoId: string; startSeconds: number; endSeconds: number; rationale: string },
  description: { spoken: unknown[]; visual: unknown[]; uncertain: unknown[] },
  describer: SegmentDescriber,
  lessons: readonly unknown[],
  safetyRules: string,
  createdAt: string,
): ReviewPacket {
  if (description.uncertain.length > 0) throw new Error("Invalid review packet: the description reports uncertain content; the segment fails");
  if (lessons.length === 0) throw new Error("Invalid review packet: no lesson embeds this clip; there is no context to review it against");
  const registry = { mediaId: segment.mediaId, videoId: segment.videoId, startSeconds: segment.startSeconds, endSeconds: segment.endSeconds, rationale: segment.rationale };
  const packet: ReviewPacket = {
    version: PACKET_VERSION,
    rubric: "segments",
    createdAt,
    items: [{
      id: `segment:${segment.mediaId}`,
      kind: "segment",
      target: segment.mediaId,
      expectedHash: createHash("sha256").update(canonicalJson(registry)).digest("hex"),
      content: { registry, description: { spoken: description.spoken, visual: description.visual }, describer, lessons },
    }],
    evidence: [],
    safetyRules,
  };
  assertPacket(packet);
  return packet;
}

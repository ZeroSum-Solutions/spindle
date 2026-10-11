// Pure version delta and credit carry-forward (ADR 0006).
// Completion stays tied to the version the learner did; a new version only
// re-opens lessons whose content hash changed. Mirrors the credit rules in the
// database (ADR 0005); the database computes the hashes.
import type { LessonCompletion, VersionManifest } from "@spindle/schema";

export interface VersionDelta {
  fromVersionId: string;
  toVersionId: string;
  /** Lesson ids in the new version's order, except `removed`, which uses the old order. */
  unchanged: string[];
  changed: string[];
  added: string[];
  removed: string[];
}

/** A completion row to create in the new version. The database assigns its id. */
export interface CarriedCredit {
  lessonId: string;
  versionId: string;
  contentHash: string;
  /** The root completion; never an intermediate carried row. */
  originCompletionId: string;
}

export interface CreditCarryForward {
  delta: VersionDelta;
  carried: CarriedCredit[];
  /** Lessons the learner completed before whose current content they have not done. */
  reopened: string[];
  /** Lessons in the new version without credit, in course order. */
  outstanding: string[];
  complete: boolean;
}

export function diffVersions(previous: VersionManifest, next: VersionManifest): VersionDelta {
  invariant(previous.versionId !== next.versionId, `cannot diff the same version ${next.versionId}`);
  const before = hashesById(previous);
  const after = hashesById(next);
  const delta: VersionDelta = {
    fromVersionId: previous.versionId,
    toVersionId: next.versionId,
    unchanged: [],
    changed: [],
    added: [],
    removed: [...before.keys()].filter((id) => !after.has(id)),
  };
  for (const [id, hash] of after) {
    const old = before.get(id);
    if (old === undefined) delta.added.push(id);
    else if (old === hash) delta.unchanged.push(id);
    else delta.changed.push(id);
  }
  return delta;
}

/**
 * Works out a learner's credit in `next`. `completions` are the learner's rows for
 * this course in any earlier version, plus any already in `next`. A lesson is
 * credited when some completion has the same lesson id and content hash. Re-running
 * with the carried rows persisted adds nothing, and duplicate completions collapse
 * to the earliest one.
 */
export function carryForwardCredit(
  previous: VersionManifest,
  next: VersionManifest,
  completions: readonly LessonCompletion[],
): CreditCarryForward {
  const delta = diffVersions(previous, next);
  const after = hashesById(next);
  const known = new Map([
    [previous.versionId, hashesById(previous)],
    [next.versionId, after],
  ]);
  const credited = new Set<string>();
  const attempted = new Set<string>();
  const earliest = new Map<string, Ranked>();
  for (const completion of completions) {
    checkAgainstVersion(completion, known.get(completion.versionId));
    const ranked = { completion, at: epochMicros(completion) };
    attempted.add(completion.lessonId);
    if (after.get(completion.lessonId) !== completion.contentHash) continue;
    if (completion.versionId === next.versionId) credited.add(completion.lessonId);
    const current = earliest.get(completion.lessonId);
    if (!current || isEarlier(ranked, current)) earliest.set(completion.lessonId, ranked);
  }
  const carried = [...after].flatMap(([lessonId, contentHash]) => {
    const origin = earliest.get(lessonId)?.completion;
    if (!origin || credited.has(lessonId)) return [];
    credited.add(lessonId);
    return [{ lessonId, versionId: next.versionId, contentHash, originCompletionId: origin.originCompletionId ?? origin.id }];
  });
  const outstanding = [...after.keys()].filter((id) => !credited.has(id));
  return {
    delta,
    carried,
    reopened: outstanding.filter((id) => attempted.has(id)),
    outstanding,
    complete: after.size > 0 && outstanding.length === 0,
  };
}

/** Rows in a version we hold a manifest for must match that manifest. Older versions are trusted as stored. */
function checkAgainstVersion(completion: LessonCompletion, hashes: Map<string, string> | undefined): void {
  if (!hashes) return;
  const hash = hashes.get(completion.lessonId);
  invariant(hash !== undefined, `completion ${completion.id} is for lesson ${completion.lessonId}, not in ${completion.versionId}`);
  invariant(hash === completion.contentHash, `completion ${completion.id} has a stale content hash`);
}

/** Review items (spaced review, quiz follow-ups) for removed lessons retire; the rest stay. */
export function retireReviewItems<T extends { lessonId: string }>(
  delta: VersionDelta,
  items: readonly T[],
): { kept: T[]; retired: T[] } {
  const removed = new Set(delta.removed);
  return {
    kept: items.filter((item) => !removed.has(item.lessonId)),
    retired: items.filter((item) => removed.has(item.lessonId)),
  };
}

/** Matches the database's `order by completed_at, id`: exact microseconds, then id (lowercase uuid text sorts like uuid bytes). */
function isEarlier(a: Ranked, b: Ranked): boolean {
  return a.at < b.at || (a.at === b.at && a.completion.id < b.completion.id);
}

interface Ranked {
  completion: LessonCompletion;
  at: bigint;
}

const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(?:Z|([+-])(\d{2}):(\d{2}))$/;

/** Microseconds since the epoch for an ISO 8601 instant with an offset, or null. Date.parse keeps only milliseconds. */
export function instantMicros(iso: string): bigint | null {
  const m = TIMESTAMP.exec(iso);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, frac = "", sign, oh = "0", om = "0"] = m;
  // setUTCFullYear, unlike Date.UTC, does not map years 0-99 to 1900-1999.
  const midnight = new Date(0).setUTCFullYear(Number(y), Number(mo) - 1, Number(d));
  const utcMs = midnight + ((Number(h) * 60 + Number(mi)) * 60 + Number(s)) * 1000;
  const offsetMinutes = (sign === "-" ? -1 : 1) * (Number(oh) * 60 + Number(om));
  return BigInt(utcMs - offsetMinutes * 60_000) * 1000n + BigInt(frac.padEnd(6, "0"));
}

/** PostgreSQL timestamptz keeps microseconds; order completions exactly. */
function epochMicros(completion: LessonCompletion): bigint {
  const at = instantMicros(completion.completedAt);
  invariant(at !== null, `completion ${completion.id} has a completedAt the engine cannot order exactly`);
  return at;
}

function hashesById(manifest: VersionManifest): Map<string, string> {
  const hashes = new Map<string, string>();
  for (const { lessonId, contentHash } of manifest.lessons) {
    invariant(!hashes.has(lessonId), `Duplicate lesson ${lessonId} in ${manifest.versionId}`);
    hashes.set(lessonId, contentHash);
  }
  return hashes;
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid version credit: ${message}`);
}

// The describer spend ledger (D-11): JSON lines in a private file, written only under
// an exclusive lock file. Every call is reserved before it is sent, at its upper-bound
// cost and in the UTC month of the reservation, and settled afterwards. A reservation
// with no settlement, or settled with an unknown cost, keeps its full upper bound, so an
// interrupted or unreadable call can never free budget (Sol PR20-01, 02, 03, 05).
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { z } from "zod";

export const MONTHLY_CAP_USD = 5;
/** One describe call per clip per 90 days, whatever came of it. */
export const DESCRIBE_INTERVAL_DAYS = 90;

const at = z.iso.datetime({ offset: true });
const reserveSchema = z.strictObject({
  type: z.literal("reserve"),
  id: z.uuid(),
  at,
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  mediaId: z.string().min(1),
  videoId: z.string().min(1),
  model: z.string().min(1),
  maxUsd: z.number().min(0),
});
const settleSchema = z.strictObject({
  type: z.literal("settle"),
  id: z.uuid(),
  at,
  costUsd: z.number().min(0).nullable(),
  ok: z.boolean(),
});
/** A line from before reservations: one settled call. */
const legacySchema = z.strictObject({
  at,
  mediaId: z.string().min(1),
  videoId: z.string().min(1),
  model: z.string().min(1),
  costUsd: z.number().min(0),
  ok: z.boolean(),
});
const entrySchema = z.union([reserveSchema, settleSchema, legacySchema]);
export type Reservation = z.output<typeof reserveSchema>;
export type Settlement = z.output<typeof settleSchema>;
export type SpendEntry = z.output<typeof entrySchema>;

/** Every line must parse: an unreadable ledger refuses all spend. */
export function parseLedger(text: string): SpendEntry[] {
  return text.split("\n").filter((l) => l.trim()).map((l, i) => {
    try {
      return entrySchema.parse(JSON.parse(l));
    } catch {
      throw new Error(`spend ledger line ${i + 1} is unreadable; refusing to spend`);
    }
  });
}

const monthOf = (d: Date) => d.toISOString().slice(0, 7);

/**
 * Spend charged to a UTC month: the settled cost of each reservation made in it, or its
 * upper bound while unsettled or settled with an unknown cost.
 */
export function monthSpendUsd(entries: readonly SpendEntry[], month: string): number {
  const settled = new Map<string, number | null>();
  for (const e of entries) if ("type" in e && e.type === "settle") settled.set(e.id, e.costUsd);
  let sum = 0;
  for (const e of entries) {
    if (!("type" in e)) {
      if (monthOf(new Date(e.at)) === month) sum += e.costUsd;
    } else if (e.type === "reserve" && e.month === month) {
      const cost = settled.get(e.id);
      sum += cost === undefined || cost === null ? e.maxUsd : Math.max(cost, 0);
    }
  }
  return sum;
}

/** When this clip was last sent to the describer, by the ledger. */
export function lastCallAt(entries: readonly SpendEntry[], mediaId: string): string | null {
  let last: string | null = null;
  for (const e of entries) {
    if ((!("type" in e) || e.type === "reserve") && e.mediaId === mediaId && (!last || Date.parse(e.at) > Date.parse(last))) last = e.at;
  }
  return last;
}

/** A clip may be described again only once 90 days have passed since its last description or call. */
export function describeAllowed(last: string | null, now: Date): boolean {
  if (!last) return true;
  const t = Date.parse(last);
  return !Number.isNaN(t) && now.getTime() - t >= DESCRIBE_INTERVAL_DAYS * 86_400_000;
}

function withLock<T>(ledgerPath: string, fn: () => T): T {
  const lockPath = `${ledgerPath}.lock`;
  let fd: number;
  try {
    fd = openSync(lockPath, "wx", 0o600);
  } catch {
    throw new Error(`the spend ledger is locked by another describe call (${lockPath}); if none is running, remove the lock file`);
  }
  try {
    return fn();
  } finally {
    closeSync(fd);
    unlinkSync(lockPath);
  }
}

function appendDurably(path: string, line: string): void {
  const fd = openSync(path, "a", 0o600);
  try {
    writeSync(fd, line);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

const read = (path: string) => (existsSync(path) ? parseLedger(readFileSync(path, "utf8")) : []);

export interface AdmitRequest {
  mediaId: string;
  videoId: string;
  model: string;
  maxUsd: number;
  /** The clip's latest description recorded in the database, if any. */
  lastDescribedAt: string | null;
  now: Date;
  capUsd?: number;
}

/**
 * Under the lock: refuses the call if the clip was described or sent in the last 90 days, or
 * if this month's spend plus the call's upper bound passes the cap; otherwise writes the
 * reservation durably before returning it. Only then may the request be sent.
 */
export function reserveCall(ledgerPath: string, req: AdmitRequest): Reservation {
  return withLock(ledgerPath, () => {
    const entries = read(ledgerPath);
    for (const last of [req.lastDescribedAt, lastCallAt(entries, req.mediaId)]) {
      if (!describeAllowed(last, req.now)) throw new Error(`refused: the clip was described or sent at ${last}; one call per clip per ${DESCRIBE_INTERVAL_DAYS} days`);
    }
    const month = monthOf(req.now);
    const spent = monthSpendUsd(entries, month);
    const cap = req.capUsd ?? MONTHLY_CAP_USD;
    if (spent + req.maxUsd > cap) {
      throw new Error(`describer spend cap: $${spent.toFixed(4)} charged to ${month} (unsettled calls at their upper bound), this call may cost up to $${req.maxUsd.toFixed(4)}, cap $${cap}`);
    }
    const r = reserveSchema.parse({ type: "reserve", id: randomUUID(), at: req.now.toISOString(), month, mediaId: req.mediaId, videoId: req.videoId, model: req.model, maxUsd: req.maxUsd });
    appendDurably(ledgerPath, `${JSON.stringify(r)}\n`);
    return r;
  });
}

/** Records what a reserved call cost; null keeps the reservation's upper bound. */
export function settleCall(ledgerPath: string, r: Reservation, costUsd: number | null, ok: boolean, now: Date): Settlement {
  return withLock(ledgerPath, () => {
    const s = settleSchema.parse({ type: "settle", id: r.id, at: now.toISOString(), costUsd, ok });
    appendDurably(ledgerPath, `${JSON.stringify(s)}\n`);
    return s;
  });
}

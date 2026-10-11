// The describer spend ledger (D-11): one JSON line per call in a private file.
// The cap is per UTC calendar month across all describe calls; a call is
// refused unless the month's spend plus the call's upper bound fits.
import { z } from "zod";

export const MONTHLY_CAP_USD = 5;
/** One describe per clip per 90 days. */
export const DESCRIBE_INTERVAL_DAYS = 90;

const entrySchema = z.strictObject({
  at: z.iso.datetime({ offset: true }),
  mediaId: z.string().min(1),
  videoId: z.string().min(1),
  model: z.string().min(1),
  costUsd: z.number().min(0),
  ok: z.boolean(),
});
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

export function monthSpendUsd(entries: readonly SpendEntry[], now: Date): number {
  const month = now.toISOString().slice(0, 7);
  return entries.filter((e) => new Date(e.at).toISOString().slice(0, 7) === month).reduce((sum, e) => sum + e.costUsd, 0);
}

/** Throws unless this month's spend plus the call's upper bound stays within the cap. */
export function assertWithinCap(entries: readonly SpendEntry[], now: Date, estimateUsd: number, capUsd = MONTHLY_CAP_USD): void {
  const spent = monthSpendUsd(entries, now);
  if (spent + estimateUsd > capUsd) {
    throw new Error(`describer spend cap: $${spent.toFixed(4)} spent this month, this call may cost up to $${estimateUsd.toFixed(4)}, cap $${capUsd}`);
  }
}

export function ledgerLine(entry: SpendEntry): string {
  return `${JSON.stringify(entrySchema.parse(entry))}\n`;
}

/** A clip may be described again only once 90 days have passed since its last description. */
export function describeAllowed(lastDescribedAt: string | null, now: Date): boolean {
  if (!lastDescribedAt) return true;
  const last = Date.parse(lastDescribedAt);
  return !Number.isNaN(last) && now.getTime() - last >= DESCRIBE_INTERVAL_DAYS * 86_400_000;
}

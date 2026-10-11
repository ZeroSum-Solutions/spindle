// Turns a successful review into publisher RPC calls. The trusted recorder
// runs them in one transaction as the named publisher; the database compares
// every expected hash again and refuses a stale one.
import { MODEL, SESSION, type ReviewOutcome } from "./harness";
import { assertPacket, canonicalJson, MAX_EVIDENCE_AGE_DAYS, packetDigest, type ReviewPacket, type SegmentDescriber } from "./packet";
import { parseReviewResult } from "./result";
import { DESCRIBER_MODEL } from "../video/describe";
import { DESCRIBE_INTERVAL_DAYS } from "../video/ledger";

/** The only model whose run may record a segment review (D-11). */
export const SEGMENT_REVIEWER_MODEL = "gpt-6.1-sol";

export interface ReceiptCall {
  fn: "publisher_review_claim" | "publisher_review_block" | "publisher_review_lesson" | "publisher_review_course" | "publisher_record_media_check";
  target: string;
  body: Record<string, unknown>;
}

/**
 * An approval lasts 24 months from its model review in the database; ask for a day less, counted
 * from the earlier of the review and now, so a late recording or clock skew never pushes it over.
 */
export function approvalExpiry(now: Date, reviewedAt?: string): string {
  const reviewed = reviewedAt === undefined ? Number.NaN : Date.parse(reviewedAt);
  const d = new Date(Number.isNaN(reviewed) ? now.getTime() : Math.min(now.getTime(), reviewed));
  d.setUTCMonth(d.getUTCMonth() + 24);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Throws unless the outcome is a clean, complete review of exactly this packet. Everything is checked
 * again here, from the raw answer: the recorder trusts no field of a stored outcome on its own.
 */
export function receiptCalls(packet: ReviewPacket, outcome: ReviewOutcome, now: Date): ReceiptCall[] {
  if (!outcome.ok) throw new Error(`not recording a failed review: ${outcome.errors.slice(0, 5).join("; ")}`);
  assertPacket(packet);
  if (outcome.run.packetDigest !== packetDigest(packet)) throw new Error("the outcome was not produced from this packet");
  if (!MODEL.test(outcome.run.model ?? "")) throw new Error("the outcome has no valid reviewer model");
  if (!SESSION.test(outcome.run.session ?? "")) throw new Error("the outcome has no valid reviewer session");
  if (Number.isNaN(Date.parse(outcome.run.reviewedAt ?? ""))) throw new Error("the outcome has no valid review time");
  const parsed = parseReviewResult(outcome.answer ?? "", packet);
  if (!parsed.ok) throw new Error(`not recording: ${parsed.errors.slice(0, 5).join("; ")}`);
  const answers = parsed.items;
  const run = { model: outcome.run.model, session: outcome.run.session, packetDigest: outcome.run.packetDigest, reviewedAt: outcome.run.reviewedAt };
  const evidence = new Map(packet.evidence.map((e) => [e.sourceId, e]));
  return packet.items.map((item): ReceiptCall => {
    const answer = answers.get(item.id);
    if (!answer) throw new Error(`${item.id} has no verdict`);
    const findings = answer.findings;
    switch (item.kind) {
      case "claim": {
        const sources = ((item.content as { sourceIds?: string[] }).sourceIds ?? []).map((s) => evidence.get(s));
        if (sources.some((s) => !s)) throw new Error(`${item.id} cites a source missing from the packet`);
        const checkedAt = sources.map((s) => s!.checkedAt).sort((a, b) => Date.parse(a) - Date.parse(b))[0]!;
        const approve = answer.verdict === "approve";
        // Every cited source, not just the oldest: an unreadable or future time must not hide behind a valid one.
        const fresh = sources.every((s) => {
          const age = now.getTime() - Date.parse(s!.checkedAt);
          return age <= MAX_EVIDENCE_AGE_DAYS * 86_400_000 && age >= -5 * 60_000;
        });
        if (approve && !fresh) {
          throw new Error(`${item.id}: its evidence was checked over ${MAX_EVIDENCE_AGE_DAYS} days before recording (or in the future); re-ingest and review again`);
        }
        if (approve && sources.some((s) => s!.retraction !== "not_retracted")) throw new Error(`${item.id}: a source is not verified as not retracted`);
        return {
          fn: "publisher_review_claim",
          target: item.target,
          body: {
            decision: approve ? "approved" : "rejected",
            expectedHash: item.expectedHash,
            receipt: {
              existenceCheckedAt: checkedAt,
              faithfulness: answer.faithfulness ?? "unfaithful",
              retractionCheckedAt: checkedAt,
              notes: canonicalJson(findings).slice(0, 2000),
            },
            ...(approve ? { expiresAt: approvalExpiry(now, run.reviewedAt) } : {}),
            run,
          },
        };
      }
      case "block":
        return {
          fn: "publisher_review_block",
          target: item.target,
          body: { verdict: answer.verdict, expectedHash: item.expectedHash, claimIds: item.claimIds ?? [], notes: canonicalJson(findings).slice(0, 2000), run },
        };
      case "segment": {
        const describer = (item.content as { describer?: SegmentDescriber }).describer;
        if (!describer?.run || typeof describer.costUsd !== "number") throw new Error(`${item.id} has no describer run`);
        // Only Sol reviews a segment, and only a Gemini run describes it (Sol PR20-04).
        if (run.model !== SEGMENT_REVIEWER_MODEL) throw new Error(`${item.id}: a segment is reviewed only by ${SEGMENT_REVIEWER_MODEL}, not ${run.model}; the describer cannot be the reviewer`);
        if (describer.run.model !== DESCRIBER_MODEL) throw new Error(`${item.id}: the describer run is not ${DESCRIBER_MODEL}`);
        // A fresh review never renews an old description (Sol R2 PR20-11).
        const described = Date.parse(describer.run.reviewedAt);
        if (!(now.getTime() - described < DESCRIBE_INTERVAL_DAYS * 86_400_000 && described <= now.getTime() + 5 * 60_000)) {
          throw new Error(`${item.id}: the description is over ${DESCRIBE_INTERVAL_DAYS} days old or not dated; describe the clip again`);
        }
        const context = (item.content as { context?: unknown }).context;
        if (!Array.isArray(context) || context.length === 0) throw new Error(`${item.id} has no lesson context`);
        return {
          fn: "publisher_record_media_check",
          target: item.target,
          body: {
            kind: "segment",
            outcome: answer.verdict,
            checkedAt: run.reviewedAt,
            run,
            describer: { run: describer.run, costUsd: describer.costUsd },
            context,
            notes: canonicalJson(findings).slice(0, 2000),
          },
        };
      }
      case "lesson":
      case "course":
        return {
          fn: item.kind === "lesson" ? "publisher_review_lesson" : "publisher_review_course",
          target: item.target,
          body: {
            verdict: answer.verdict,
            expectedHash: item.expectedHash,
            ...(item.kind === "lesson" ? { claimIds: item.claimIds ?? [] } : {}),
            checks: answer.checks,
            findings,
            run,
          },
        };
    }
  });
}

/** One transaction of SQL for the recorder: as the service role, every call or none. */
export function receiptSql(publisherId: string, calls: readonly ReceiptCall[]): string {
  const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;
  if (!/^[0-9a-f-]{36}$/.test(publisherId)) throw new Error("publisher id must be a uuid");
  const lines = calls.map((c) => {
    if (!/^[0-9a-f-]{36}$/.test(c.target)) throw new Error(`target ${c.target} must be a uuid`);
    return `select public.${c.fn}(${lit(publisherId)}, ${lit(c.target)}, ${lit(JSON.stringify(c.body))}::jsonb);`;
  });
  return [
    "begin;",
    `select set_config('role', 'service_role', true), set_config('request.jwt.claims', '{"role":"service_role"}', true);`,
    ...lines,
    "commit;",
  ].join("\n");
}

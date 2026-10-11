// Retraction state for the claim pipeline (ADR 0004, ADR 0007). Unknown is
// never "not retracted": only a fully verified receipt counts as clean.
import type { SourceCheck } from "./types";

export type RetractionState = "retracted" | "not_retracted" | "unknown";

/** `flagged` or any retraction source is retracted; only `verified` is not retracted; everything else is unknown. */
export function retractionState(check: SourceCheck, alsoFlagged = false): RetractionState {
  if (alsoFlagged || check.status === "flagged" || check.retracted) return "retracted";
  return check.status === "verified" ? "not_retracted" : "unknown";
}

/** The notice body for publisher_record_retraction (origin crossref or manual). */
export interface RetractionNotice {
  origin: "crossref" | "manual";
  reference: string;
  detectedAt: string;
}

export function retractionNotice(check: SourceCheck, detail?: { crossrefNotice?: string; via?: string }): RetractionNotice {
  if (check.retractionSources.includes("crossref")) {
    return { origin: "crossref", reference: (detail?.crossrefNotice ?? check.doi).slice(0, 500), detectedAt: check.checkedAt };
  }
  const via = detail?.via ?? (check.retractionSources.join(", ") || "a retraction flag");
  return { origin: "manual", reference: `${via} reports ${check.doi} as retracted`.slice(0, 500), detectedAt: check.checkedAt };
}

export type RecheckAction =
  | { action: "record"; notice: RetractionNotice }
  | { action: "clear" }
  | { action: "unknown"; issues: string[] };

/** What the monthly recheck does with one source: record a retraction, leave it, or report it as unknown. */
export function recheckAction(check: SourceCheck): RecheckAction {
  const state = retractionState(check);
  if (state === "retracted") return { action: "record", notice: retractionNotice(check) };
  if (state === "not_retracted") return { action: "clear" };
  return { action: "unknown", issues: check.issues.length > 0 ? check.issues : [`status ${check.status}`] };
}

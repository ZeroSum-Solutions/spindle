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

export interface CitedSource {
  id: string;
  doi: string | null;
  kind: string;
}

export interface PrepublishDecision {
  publish: boolean;
  /** Retractions to record before refusing. */
  record: { sourceId: string; notice: RetractionNotice }[];
  /** DOI sources whose status is unknown now. */
  unknown: { sourceId: string; issues: string[] }[];
  /** Papers without a DOI, which verifySource cannot check. */
  unverifiable: string[];
}

/** Kinds that are not retractable papers: an edition and page, or an official term. */
const NOT_RETRACTABLE = new Set(["textbook", "nomenclature"]);

/**
 * The pre-publish gate (plan section 7: retraction status is rechecked before every publish). Every
 * cited paper must be verified as not retracted now; anything else refuses the publish.
 */
export function prepublishDecision(sources: readonly CitedSource[], checks: ReadonlyMap<string, SourceCheck>): PrepublishDecision {
  const d: PrepublishDecision = { publish: false, record: [], unknown: [], unverifiable: [] };
  for (const s of sources) {
    if (!s.doi) {
      if (!NOT_RETRACTABLE.has(s.kind)) d.unverifiable.push(s.id);
      continue;
    }
    const check = checks.get(s.id);
    if (!check) {
      d.unknown.push({ sourceId: s.id, issues: ["not checked"] });
      continue;
    }
    const action = recheckAction(check);
    if (action.action === "record") d.record.push({ sourceId: s.id, notice: action.notice });
    else if (action.action === "unknown") d.unknown.push({ sourceId: s.id, issues: action.issues });
  }
  d.publish = d.record.length === 0 && d.unknown.length === 0 && d.unverifiable.length === 0;
  return d;
}

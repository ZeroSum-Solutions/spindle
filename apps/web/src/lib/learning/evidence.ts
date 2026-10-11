import type { ClaimIntegrityState } from "@spindle/schema";
import { blockEvidence } from "@spindle/engine";

// How a science block presents, from the claim integrity the server reports for its version
// (version_integrity, ADR 0007). Pure, so it is unit-tested.

export interface EvidenceView {
  /** False when a cited claim was withdrawn or is missing from the report: the block loses the Science presentation. */
  presentsAsScience: boolean;
  withdrawn: boolean;
  retracted: boolean;
  recheckDue: boolean;
  /** The integrity report could not be read: the block loses the Science presentation (fail closed) but is not called withdrawn. */
  statusUnknown: boolean;
}

/**
 * `integrity` is the version's report keyed by claim id, or null when it could not be read.
 * With a report, a claim it does not mention counts as withdrawn (fail closed, as the engine
 * rules). Without one, the block fails closed too: it is not presented as science, but
 * nothing else is inferred, so it is not called withdrawn either.
 * `flagged` carries the existing retraction flags, which stay authoritative either way.
 */
export function evidenceView(claimIds: readonly string[], flagged: ReadonlySet<string>, integrity: ReadonlyMap<string, ClaimIntegrityState> | null): EvidenceView {
  const flaggedHere = claimIds.some((id) => flagged.has(id));
  if (integrity === null) {
    return { presentsAsScience: false, withdrawn: false, retracted: flaggedHere, recheckDue: false, statusUnknown: true };
  }
  const e = blockEvidence(claimIds, integrity);
  return { presentsAsScience: e.presentsAsScience, withdrawn: e.withdrawn, retracted: e.retracted || flaggedHere, recheckDue: e.recheckDue, statusUnknown: false };
}

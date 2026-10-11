// Spindle public contracts (Apache-2.0). Other products (a gym operating system,
// a posture scanner) implement these to send Spindle aggregate client signals.
// Draft: the disclosure rules for cohort data are not final (plan phase 5), and
// Spindle does not ingest cohort data until they are.

/** Controlled vocabulary for what a gym's clients need. Add tags; never rename them. */
export const SIGNAL_TAGS = [
  "goal_fat_loss",
  "goal_hypertrophy",
  "goal_performance",
  "goal_general_health",
  "low_aerobic_base",
  "shoulder_restriction",
  "shoulder_pain_history",
  "anterior_pelvic_tilt",
  "posterior_pelvic_tilt",
  "pelvic_obliquity",
  "lr_asymmetry",
  "forward_head_posture",
  "thoracic_kyphosis",
  "knee_valgus",
  "low_back_pain_history",
  "ankle_dorsiflexion_limit",
] as const;

export type SignalTag = (typeof SIGNAL_TAGS)[number];

export function isSignalTag(value: string): value is SignalTag {
  return (SIGNAL_TAGS as readonly string[]).includes(value);
}

/**
 * A count for one tag in one cohort. `count` is null when the cell is
 * suppressed; suppressed means unknown, never zero.
 */
export interface CohortCell {
  tag: SignalTag;
  count: number | null;
}

export interface CohortSnapshotDraft {
  schema: "spindle.cohort-snapshot.draft";
  orgId: string;
  source: string;
  asOf: string;
  cohortSize: number;
  cells: CohortCell[];
}

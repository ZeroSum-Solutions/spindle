// What the completion control says after the server answers. Pure, so the client and
// tests share it. Completion and carried credit stay distinct: a row carried from an
// earlier version is credit, not a completion the learner just made here.
import { formatDate } from "./format";

export type CompleteState =
  | { status: "idle" }
  | {
      status: "saved";
      versionNumber: number;
      completedAt: string;
      /** Set when the row is credit carried from another completion (its root). */
      credit?: { completedAt: string; versionNumber: number | null };
    }
  | { status: "error"; message: string };

export interface SavedRow {
  completed_at: string;
  origin_completion_id: string | null;
}

export interface RootRow {
  completed_at: string;
  versionNumber: number | null;
}

/** The saved state for the row `complete_lesson` returned, and its root when the row is carried credit. */
export function savedState(versionNumber: number, row: SavedRow, root: RootRow | null): CompleteState {
  if (row.origin_completion_id === null) return { status: "saved", versionNumber, completedAt: row.completed_at };
  return {
    status: "saved",
    versionNumber,
    completedAt: row.completed_at,
    credit: { completedAt: root?.completed_at ?? row.completed_at, versionNumber: root?.versionNumber ?? null },
  };
}

/** One sentence after the bold lead ("Saved." or "Credited."). */
export function savedMessage(state: Extract<CompleteState, { status: "saved" }>): { lead: string; text: string } {
  if (!state.credit) return { lead: "Saved.", text: `Lesson completed for v${state.versionNumber} on ${formatDate(state.completedAt)}.` };
  const from = state.credit.versionNumber ? ` in v${state.credit.versionNumber}` : "";
  return {
    lead: "Credited.",
    text: `This lesson already counts for v${state.versionNumber} through your completion on ${formatDate(state.credit.completedAt)}${from}.`,
  };
}

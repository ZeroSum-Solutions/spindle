import { SupportLabel } from "../learn/labels";
import { noteFrom, type CoachNoteView } from "./view";

export const COACH_NOTE_CAPTION = "Coach's note. Based on coaching practice, not a research claim.";

/**
 * A coach's welcome note on a Gym method course, above the lesson list: the admitted text, the
 * display name frozen at publish, the fixed Practice-based label and a fixed caption. No photo, no
 * role. Geist throughout: the brand font never sets body text.
 */
export function CoachNote({ note }: { note: CoachNoteView }) {
  const from = `Note from ${noteFrom(note)}`;
  return (
    <aside data-coach-note aria-label={from} className="flex flex-col gap-3 rounded-card border border-l-[3px] border-border border-l-practice bg-surface px-5 py-5 md:px-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-[16px] font-semibold leading-[1.4] text-text" style={{ overflowWrap: "anywhere" }}>
          {from}
        </p>
        <SupportLabel support="practice-based" />
      </div>
      <p className="max-w-[60ch] text-reading text-text" style={{ overflowWrap: "anywhere" }}>
        {note.text}
      </p>
      <p className="text-label text-text-muted">{COACH_NOTE_CAPTION}</p>
    </aside>
  );
}

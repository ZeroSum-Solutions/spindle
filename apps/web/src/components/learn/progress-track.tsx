/**
 * Completion and position are separate facts: "current-done" is the open lesson when it is already done
 * (a revisit), so it still counts as done and still shows as the current place.
 */
export type Segment = "done" | "current" | "current-done" | "rest";

const isDone = (s: Segment) => s === "done" || s === "current-done";
const isCurrent = (s: Segment) => s === "current" || s === "current-done";

/** One segment per lesson, from the lesson states: done or credited is done, the open lesson is current. */
export function segmentsOf(lessons: readonly { state: string }[], currentIndex?: number): Segment[] {
  return lessons.map((l, i) => {
    const done = l.state === "done" || l.state === "credited";
    if (i === currentIndex) return done ? "current-done" : "current";
    return done ? "done" : "rest";
  });
}

/**
 * The gap between segments, in px (it does not grow with text size), shrinking as the course grows so
 * segments never collapse: in a 96px track (the minimum) every segment keeps at least 1px, up to 96 lessons.
 */
export function segmentGap(total: number): number {
  return total <= 12 ? 4 : total <= 24 ? 2 : total <= 48 ? 1 : 0;
}

/**
 * The measurement layer as a readout (DESIGN.md › Shapes): "03 / 08", one segment per lesson (done is
 * ink, the current place is the signal, the rest are hairlines) and the share done. The words carry
 * the meaning for assistive technology; the segments are decorative. With no current lesson the
 * readout is the count done, so a finished course reads "08 / 08", never one past the end.
 */
export function ProgressTrack({ segments, className = "" }: { segments: readonly Segment[]; className?: string }) {
  const total = segments.length;
  const done = segments.filter(isDone).length;
  const current = segments.findIndex(isCurrent);
  const shown = current >= 0 ? current + 1 : done;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const pad = (n: number) => String(n).padStart(2, "0");
  const words = current >= 0 ? `Lesson ${current + 1} of ${total}, ${done} done` : `${done} of ${total} lessons done`;
  return (
    <div data-progress-track className={`flex min-w-0 flex-wrap items-center gap-attach ${className}`}>
      <span aria-hidden className="tabular shrink-0 text-code text-text">
        {pad(shown)} / {pad(total)}
      </span>
      <span aria-hidden className="grid min-w-24 flex-1" style={{ gridTemplateColumns: `repeat(${Math.max(total, 1)}, minmax(0, 1fr))`, columnGap: `${segmentGap(total)}px` }}>
        {segments.map((s, i) => (
          <span
            key={i}
            data-segment={isDone(s) ? "done" : isCurrent(s) ? "current" : "rest"}
            data-current={isCurrent(s) || undefined}
            className={`h-1.5 rounded-[1px] ${isCurrent(s) ? "measure-current" : isDone(s) ? "measure-done" : "measure-rest"}`}
          />
        ))}
      </span>
      <span aria-hidden className="tabular shrink-0 text-code text-text-muted">
        {pct}%
      </span>
      <span className="sr-only">{words}</span>
    </div>
  );
}

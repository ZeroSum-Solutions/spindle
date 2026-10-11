export type Segment = "done" | "current" | "rest";

/** One segment per lesson, from the lesson states: done or credited is done, the open lesson is current. */
export function segmentsOf(lessons: readonly { state: string }[], currentIndex?: number): Segment[] {
  return lessons.map((l, i) => (i === currentIndex ? "current" : l.state === "done" || l.state === "credited" ? "done" : "rest"));
}

/**
 * The measurement layer as a readout (DESIGN.md › Shapes): "03 / 08", one segment per lesson (done is
 * ink, the current place is the signal, the rest are hairlines) and the share done. The words carry
 * the meaning for assistive technology; the segments are decorative. With no current lesson the
 * readout is the count done, so a finished course reads "08 / 08", never one past the end.
 */
export function ProgressTrack({ segments, className = "" }: { segments: readonly Segment[]; className?: string }) {
  const total = segments.length;
  const done = segments.filter((s) => s === "done").length;
  const current = segments.indexOf("current");
  const shown = current >= 0 ? current + 1 : done;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const pad = (n: number) => String(n).padStart(2, "0");
  const words = current >= 0 ? `Lesson ${current + 1} of ${total}, ${done} done` : `${done} of ${total} lessons done`;
  return (
    <div data-progress-track className={`flex min-w-0 items-center gap-attach ${className}`}>
      <span aria-hidden className="tabular shrink-0 text-code text-text">
        {pad(shown)} / {pad(total)}
      </span>
      <span aria-hidden className="grid min-w-0 flex-1 gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(total, 1)}, minmax(0, 1fr))` }}>
        {segments.map((s, i) => (
          <span key={i} data-segment={s} className={`h-1.5 rounded-[1px] measure-${s}`} />
        ))}
      </span>
      <span aria-hidden className="tabular shrink-0 text-code text-text-muted">
        {pct}%
      </span>
      <span className="sr-only">{words}</span>
    </div>
  );
}

// Timestamps in a segment description (Sol PR20-08). The describer reports time in
// the full video ("m:ss" or "h:mm:ss"). Every line must fall inside the window it was
// given, and at least one visual line must fall inside the selected segment, or the
// description does not show the segment.

/** Seconds either side of the segment, so omitted qualifications are visible. */
export const CONTEXT_SECONDS = 15;

/** Seconds for "m:ss" or "h:mm:ss", or null when it is not a valid time. */
export function parseTimestamp(t: string): number | null {
  const m = /^(?:(\d{1,2}):([0-5]\d)|(\d{1,3})):([0-5]\d)$/.exec(t);
  if (!m) return null;
  if (m[1] !== undefined) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[4]);
  return Number(m[3]) * 60 + Number(m[4]);
}

interface Line { t: string }

/** Null when the times fit the segment and its context window, otherwise why not. */
export function descriptionTimesError(
  description: { spoken: readonly Line[]; visual: readonly Line[] },
  segment: { startSeconds: number; endSeconds: number },
): string | null {
  const from = Math.max(0, segment.startSeconds - CONTEXT_SECONDS);
  const to = segment.endSeconds + CONTEXT_SECONDS;
  for (const line of [...description.spoken, ...description.visual]) {
    const s = parseTimestamp(line.t);
    if (s === null) return `timestamp ${JSON.stringify(line.t).slice(0, 20)} is not a valid time`;
    if (s < from || s > to) return `timestamp ${line.t} is outside the described window ${from}s to ${to}s`;
  }
  const inSegment = description.visual.some((l) => {
    const s = parseTimestamp(l.t)!;
    return s >= segment.startSeconds && s <= segment.endSeconds;
  });
  return inSegment ? null : "no visual line falls inside the selected segment";
}

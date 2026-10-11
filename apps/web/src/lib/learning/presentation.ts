// Presentation rules for the lesson player, pure so they are unit-tested.
import type { LessonViewBlock } from "@spindle/schema";
import { formatDate } from "./format";
import type { LessonView } from "./view";

/**
 * Which supported blocks show their support label. Consecutive blocks with the same
 * support form one run and are labelled once, at its start; a heading, image or
 * diagram ends the run. Every block keeps its support in data and in its margin rule.
 * `runKey` lets the caller split runs further, e.g. a withdrawn science block starts its own.
 */
export function supportLabelPlan(blocks: readonly LessonViewBlock[], runKey: (block: Extract<LessonViewBlock, { support: unknown }>) => string = (block) => block.support): boolean[] {
  let previous: string | null = null;
  return blocks.map((block) => {
    const support = "support" in block ? runKey(block) : null;
    const show = support !== null && support !== previous;
    previous = support;
    return show;
  });
}

/** The one-line receipt for a lesson that was done or credited when the page loaded. */
export function receiptLine(lesson: Pick<LessonView, "state" | "completedAt" | "origin">, versionNumber: number): { lead: string; detail: string } | null {
  if (lesson.state === "done") {
    return { lead: "Lesson complete", detail: `v${versionNumber}${lesson.completedAt ? ` · ${formatDate(lesson.completedAt)}` : ""}` };
  }
  if (lesson.state === "credited") {
    const from = lesson.origin
      ? `from your completion on ${formatDate(lesson.origin.completedAt)}${lesson.origin.versionNumber ? ` in v${lesson.origin.versionNumber}` : ""}`
      : "from an earlier completion";
    return { lead: "Credited", detail: `v${versionNumber} · ${from}` };
  }
  return null;
}

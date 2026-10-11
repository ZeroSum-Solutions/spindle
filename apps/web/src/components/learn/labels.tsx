import type { ReactNode } from "react";
import { TriangleAlert, Check, Clipboard, FileText } from "lucide-react";
import type { CurriculumLayer, Support } from "@spindle/schema";
import { LAYER_LABEL, type LessonState, type LessonView } from "@/lib/learning/view";
import { formatDate } from "@/lib/learning/format";

const ICON = { "aria-hidden": true, strokeWidth: 1.75, className: "size-4 shrink-0" } as const;

/** Support type of one block. Never inferred from citations, colour, layer or completion. */
export function SupportLabel({ support }: { support: Support }) {
  return support === "science" ? (
    <span className="inline-flex items-center gap-1.5 rounded-small bg-science-soft px-2 py-0.5 text-label font-medium text-science">
      <FileText {...ICON} />
      Science
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-small bg-practice-soft px-2 py-0.5 text-label font-medium text-practice">
      <Clipboard {...ICON} />
      Practice-based
    </span>
  );
}

/** Curriculum layer of a course. A separate axis from block support. */
export function LayerLabel({ layer }: { layer: CurriculumLayer }) {
  return (
    <span className="inline-flex items-center rounded-small border border-border bg-surface px-2 py-0.5 text-label font-medium text-text-muted">
      {LAYER_LABEL[layer]}
    </span>
  );
}

export function VersionTag({ n }: { n: number }) {
  return <span className="font-mono text-code text-text-muted">v{n}</span>;
}

const STATE_TEXT: Record<LessonState, string> = {
  done: "Done",
  credited: "Credited",
  updated: "Updated",
  new: "New",
  todo: "To do",
};

export function LessonStateLabel({ lesson }: { lesson: Pick<LessonView, "state"> }) {
  const done = lesson.state === "done" || lesson.state === "credited";
  return (
    <span
      data-state={lesson.state}
      className={`inline-flex items-center gap-1 text-label font-medium ${done ? "text-text" : lesson.state === "todo" ? "text-text-muted" : "text-brand"}`}
    >
      {done ? <Check {...ICON} /> : null}
      {STATE_TEXT[lesson.state]}
    </span>
  );
}

/** The literal reason behind a lesson's state, for the overview and the player. */
export function LessonStateDetail({ lesson }: { lesson: LessonView }) {
  switch (lesson.state) {
    case "done":
      return <>Completed on {formatDate(lesson.completedAt!)}.</>;
    case "credited":
      return lesson.origin?.versionNumber ? (
        <>
          Credit carried from your completion on {formatDate(lesson.origin.completedAt)} in v{lesson.origin.versionNumber}. The lesson has
          not changed since.
        </>
      ) : (
        <>Credit carried from an earlier completion on {formatDate(lesson.origin!.completedAt)}. The lesson has not changed since.</>
      );
    case "updated":
      return <>You completed an earlier version. This lesson changed, so it is open again.</>;
    case "new":
      return <>New in this version.</>;
    default:
      return null;
  }
}

/** Integrity alert. Used for retracted sources; says what happened and what still holds. */
export function IntegrityAlert({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="note" className="flex items-start gap-3 rounded-card border border-danger/30 bg-danger-soft p-4 text-danger">
      <TriangleAlert aria-hidden strokeWidth={1.75} className="mt-0.5 size-5 shrink-0" />
      <div className="flex flex-col gap-1">
        <p className="font-medium">{title}</p>
        <div className="text-sm text-text">{children}</div>
      </div>
    </div>
  );
}

export function ProgressText({ done, total }: { done: number; total: number }) {
  return (
    <span className="text-label text-text-muted">
      {done} of {total} lessons done
    </span>
  );
}

/** Decorative: the literal "x of y" text next to it is the accessible value. */
export function ProgressBar({ done, total }: { done: number; total: number }) {
  return (
    <span aria-hidden className="block h-1 w-full max-w-xs overflow-hidden rounded-full bg-surface-muted">
      <span className="block h-full bg-ink" style={{ width: `${total === 0 ? 0 : (done / total) * 100}%` }} />
    </span>
  );
}

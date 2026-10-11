import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import type { AssignmentSummary } from "@/lib/learning/load";
import { LayerLabel, ProgressBar, ProgressText, VersionTag } from "./labels";

/** One assigned course: title, version, layer, literal progress, change and integrity notes. */
export function CourseRow({ item, base, earlier = [] }: { item: AssignmentSummary; base: string; earlier?: AssignmentSummary[] }) {
  return (
    <div className="flex flex-col">
      <LatestRow item={item} base={base} />
      {earlier.length > 0 ? (
        <div className="flex flex-col gap-2 px-4 pb-4 md:px-6">
          <p className="text-label text-text-muted">Earlier versions</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {earlier.map((e) => (
              <li key={e.id}>
                <Link href={`${base}/${e.id}`} className="inline-flex min-h-11 items-center whitespace-nowrap text-label text-brand underline underline-offset-4 hover:text-brand-hover">
                  v{e.versionNumber}
                  {e.available ? ` · ${e.view.done} of ${e.view.total} done` : " · unavailable"}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function LatestRow({ item, base }: { item: AssignmentSummary; base: string }) {
  if (!item.available) {
    return (
      <div className="flex flex-col gap-1 p-4 md:px-6">
        <p className="font-medium">
          Course unavailable <VersionTag n={item.versionNumber} />
        </p>
        <p className="text-label text-text-muted">This version can&apos;t be displayed. Tell your gym lead.</p>
      </div>
    );
  }
  const { view } = item;
  const changed = view.delta ? view.delta.changed.length + view.delta.added.length : 0;
  return (
    <Link href={`${base}/${item.id}`} className="flex flex-col gap-2 p-4 hover:bg-surface-muted md:px-6" data-testid="course-row">
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-xl font-medium tracking-tight">{view.title}</span>
        <VersionTag n={view.versionNumber} />
      </span>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <LayerLabel layer={view.layer} />
        <ProgressText done={view.done} total={view.total} />
        {view.complete ? <span className="text-label font-medium">Complete for v{view.versionNumber}</span> : null}
        {changed > 0 ? (
          <span className="text-label text-text">
            Updated: {changed} {changed === 1 ? "lesson" : "lessons"} changed or added since v{view.delta!.fromVersionNumber}
          </span>
        ) : null}
        {view.flaggedClaimIds.length > 0 ? (
          <span className="inline-flex items-center gap-1 text-label font-medium text-caution">
            <TriangleAlert aria-hidden strokeWidth={1.75} className="size-4" />
            Source retracted
          </span>
        ) : null}
      </span>
      <ProgressBar done={view.done} total={view.total} />
    </Link>
  );
}

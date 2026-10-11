import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, TriangleAlert } from "lucide-react";
import { LayerLabel, ProgressBar, ProgressText, VersionTag } from "@/components/learn/labels";
import { LearnShell, LoadingNote } from "@/components/learn/shell";
import { learnerGym, myAssignments, type AssignmentSummary } from "@/lib/learning/load";

export default function LearnPage(props: PageProps<"/gyms/[slug]/learn">) {
  return (
    <Suspense
      fallback={
        <LearnShell>
          <LoadingNote>Loading your courses…</LoadingNote>
        </LearnShell>
      }
    >
      <Courses {...props} />
    </Suspense>
  );
}

async function Courses({ params }: PageProps<"/gyms/[slug]/learn">) {
  const { slug } = await params;
  const ctx = await learnerGym(slug);
  const items = await myAssignments(ctx);
  const base = `/gyms/${ctx.org.slug}/learn`;
  const resume = items.find((a): a is Extract<AssignmentSummary, { available: true }> => a.available && a.view.next !== null);

  return (
    <LearnShell gym={ctx.org.name} back={{ href: `/gyms/${ctx.org.slug}`, label: ctx.org.name }}>
      <h1 className="text-heading font-medium">Your courses</h1>
      {items.length === 0 ? (
        <p className="rounded-card border border-border bg-surface p-6 text-text-muted">Nothing is assigned to you in this gym yet.</p>
      ) : (
        <>
          {resume ? (
            <section aria-labelledby="resume-title" className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5 md:p-6">
              <p className="text-label text-text-muted">Next up in {resume.view.title}</p>
              <h2 id="resume-title" className="text-xl font-medium">
                {resume.view.next!.title}
              </h2>
              <Link
                href={`${base}/${resume.id}/${resume.view.next!.slug}`}
                className="inline-flex min-h-12 items-center gap-2 self-start rounded-control bg-ink px-5 font-medium text-white hover:bg-ink-hover"
              >
                Resume lesson
                <ArrowRight aria-hidden strokeWidth={1.75} className="size-4" />
              </Link>
            </section>
          ) : null}
          <ul aria-label="Assigned courses" className="flex flex-col divide-y divide-border rounded-card border border-border bg-surface">
            {items.map((item) => (
              <li key={item.id}>
                <CourseRow item={item} base={base} />
              </li>
            ))}
          </ul>
        </>
      )}
    </LearnShell>
  );
}

function CourseRow({ item, base }: { item: AssignmentSummary; base: string }) {
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
        <span className="text-lg font-medium">{view.title}</span>
        <VersionTag n={view.versionNumber} />
      </span>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <LayerLabel layer={view.layer} />
        <ProgressText done={view.done} total={view.total} />
        {view.complete ? <span className="text-label font-medium">Complete for v{view.versionNumber}</span> : null}
        {changed > 0 ? (
          <span className="text-label text-brand">
            Updated: {changed} {changed === 1 ? "lesson" : "lessons"} changed or added since v{view.delta!.fromVersionNumber}
          </span>
        ) : null}
        {view.flaggedClaimIds.length > 0 ? (
          <span className="inline-flex items-center gap-1 text-label font-medium text-danger">
            <TriangleAlert aria-hidden strokeWidth={1.75} className="size-4" />
            Source retracted
          </span>
        ) : null}
      </span>
      <ProgressBar done={view.done} total={view.total} />
    </Link>
  );
}

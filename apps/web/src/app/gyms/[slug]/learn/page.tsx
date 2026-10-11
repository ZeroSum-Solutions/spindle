import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import { CourseRow } from "@/components/learn/course-row";
import { LearnShell, LoadingNote } from "@/components/learn/shell";
import { learnerGym, myAssignments, type AssignmentSummary } from "@/lib/learning/load";
import { byCourse } from "@/lib/learning/view";
import { loadModuleStatus } from "@/lib/learning/quiz-server";

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
  const courses = byCourse(items);
  // Completion labels come from the server's module status, never from lesson counts alone.
  const statuses = new Map(
    await Promise.all(courses.map(async (c) => [c.latest.id, c.latest.available ? ((await loadModuleStatus(ctx, c.latest.id))?.complete ?? null) : null] as const)),
  );
  // Resume only ever points into the newest assigned version of a course.
  const resume = courses
    .map((c) => c.latest)
    .find((a): a is Extract<AssignmentSummary, { available: true }> => a.available && a.view.next !== null);

  return (
    <LearnShell gym={ctx.org.name} back={{ href: `/gyms/${ctx.org.slug}`, label: ctx.org.name }}>
      <div data-layout="column" className="mx-auto flex w-full max-w-3xl flex-col gap-6">
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
            {courses.map((course) => (
              <li key={course.latest.id}>
                <CourseRow item={course.latest} base={base} earlier={course.earlier} moduleComplete={statuses.get(course.latest.id) ?? null} />
              </li>
            ))}
          </ul>
        </>
      )}
      </div>
    </LearnShell>
  );
}

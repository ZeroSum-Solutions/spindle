import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { LessonBlocks, LessonMedia, LessonResources } from "@/components/learn/blocks";
import { CompleteLesson } from "@/components/learn/complete-lesson";
import { IntegrityAlert, LayerLabel, LessonStateDetail, SupportLegend, VersionTag } from "@/components/learn/labels";
import { LessonOutline } from "@/components/learn/outline";
import { LearnShell, LoadingNote, VersionUnavailable } from "@/components/learn/shell";
import { claimEvidence, learnerGym, lessonClaimIds, myAssignment } from "@/lib/learning/load";
import { lessonsOf } from "@/lib/learning/view";

const FORMAT: Record<string, string> = { article: "Article", video: "Video", diagram: "Diagram", practice: "Practice", quiz: "Quiz" };

export default function LessonPage(props: PageProps<"/gyms/[slug]/learn/[assignment]/[lesson]">) {
  return (
    <Suspense
      fallback={
        <LearnShell>
          <LoadingNote>Loading the lesson…</LoadingNote>
        </LearnShell>
      }
    >
      <LessonPlayer {...props} />
    </Suspense>
  );
}

async function LessonPlayer({ params }: PageProps<"/gyms/[slug]/learn/[assignment]/[lesson]">) {
  const { slug, assignment: rawId, lesson: lessonSlug } = await params;
  const ctx = await learnerGym(slug);
  const detail = await myAssignment(ctx, rawId);
  const courseHref = `/gyms/${ctx.org.slug}/learn/${detail.assignmentId}`;
  if (!detail.available) {
    return (
      <LearnShell gym={ctx.org.name} back={{ href: `/gyms/${ctx.org.slug}/learn`, label: "Your courses" }}>
        <VersionUnavailable versionNumber={detail.versionNumber} />
      </LearnShell>
    );
  }
  const { version, view } = detail;
  const lessons = lessonsOf(version.course);
  const index = lessons.findIndex((l) => l.slug === lessonSlug);
  if (index < 0) notFound();
  const lesson = lessons[index]!;
  const state = view.lessons[index]!;
  const flagged = new Set(view.flaggedClaimIds);
  const claims = await claimEvidence(ctx, lessonClaimIds(version, lesson.id));
  const prev = lessons[index - 1];
  const next = lessons[index + 1];
  const done = state.state === "done" || state.state === "credited";

  return (
    <LearnShell gym={ctx.org.name} back={{ href: courseHref, label: view.title }}>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-6 lg:self-start">
          <LessonOutline view={view} base={courseHref} currentId={lesson.id} />
        </div>
        <article className="flex max-w-[68ch] flex-col gap-8 text-reading" aria-labelledby="lesson-title">
          <header className="flex flex-col gap-3">
            <p className="flex flex-wrap items-center gap-2 text-label text-text-muted">
              <LayerLabel layer={view.layer} />
              <VersionTag n={view.versionNumber} />
              <span>
                Lesson {index + 1} of {lessons.length} · {state.partTitle}
              </span>
            </p>
            <h1 id="lesson-title" className="text-heading font-medium text-text">
              {lesson.title}
            </h1>
            <p className="text-label text-text-muted">
              {lesson.durationMinutes} min · {FORMAT[lesson.format]}
            </p>
            {lesson.summary ? <p className="text-text-muted">{lesson.summary}</p> : null}
          </header>

          {state.flagged ? (
            <IntegrityAlert title="A source in this lesson was retracted after publishing">
              The affected blocks are marked &quot;Source retracted&quot;. Your completion and credit stay as they are.
            </IntegrityAlert>
          ) : null}

          {lesson.objectives.length > 0 ? (
            <section className="rounded-card border border-border bg-surface p-4">
              <h2 className="text-label font-medium text-text-muted">In this lesson you will</h2>
              <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-base">
                {lesson.objectives.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {lesson.blocks.some((b) => "support" in b) ? <SupportLegend /> : null}

          <LessonBlocks blocks={lesson.blocks} ctx={{ orgId: version.orgId, claims, flagged }} />
          <LessonMedia media={lesson.media} orgId={version.orgId} />
          <LessonResources resources={lesson.resources} orgId={version.orgId} />

          <section aria-label="Lesson completion" className="flex flex-col gap-3 border-t border-border pt-6 text-base">
            <CompleteLesson
              gym={ctx.org.slug}
              assignmentId={detail.assignmentId}
              lessonId={lesson.id}
              done={done}
              receipt={
                done ? (
                  <>
                    <span className="font-medium">{state.state === "done" ? "Completed." : "Credited."}</span> <LessonStateDetail lesson={state} />
                  </>
                ) : state.state === "updated" ? (
                  <LessonStateDetail lesson={state} />
                ) : null
              }
            />
          </section>

          <nav aria-label="Lesson navigation" className="flex flex-wrap justify-between gap-3 text-base">
            {prev ? (
              <Link href={`${courseHref}/${prev.slug}`} className="inline-flex min-h-11 items-center gap-1.5 text-brand hover:text-brand-hover">
                <ArrowLeft aria-hidden strokeWidth={1.75} className="size-4" />
                <span>
                  <span className="sr-only">Previous lesson: </span>
                  {prev.title}
                </span>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link href={`${courseHref}/${next.slug}`} className="inline-flex min-h-11 items-center gap-1.5 text-brand hover:text-brand-hover">
                <span>
                  <span className="sr-only">Next lesson: </span>
                  {next.title}
                </span>
                <ArrowRight aria-hidden strokeWidth={1.75} className="size-4" />
              </Link>
            ) : (
              <Link href={courseHref} className="inline-flex min-h-11 items-center gap-1.5 text-brand hover:text-brand-hover">
                Back to the course
              </Link>
            )}
          </nav>
        </article>
      </div>
    </LearnShell>
  );
}

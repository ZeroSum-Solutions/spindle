import { moduleQuizHref } from "@/lib/learning/quiz";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import { IntegrityAlert, LayerLabel, LessonStateDetail, LessonStateLabel, ProgressBar, ProgressText, VersionTag } from "@/components/learn/labels";
import { LearnShell, LoadingNote, VersionUnavailable } from "@/components/learn/shell";
import { learnerGym, myAssignment } from "@/lib/learning/load";
import { groupByPart } from "@/lib/learning/view";
import { VersionNotice } from "@/components/learn/version-notice";
import { ModuleStatusCard } from "@/components/learn/module-status";
import { learnerQuestions } from "@spindle/engine";
import { loadModuleStatus } from "@/lib/learning/quiz-server";

export default function CoursePage(props: PageProps<"/gyms/[slug]/learn/[assignment]">) {
  return (
    <Suspense
      fallback={
        <LearnShell>
          <LoadingNote>Loading the course…</LoadingNote>
        </LearnShell>
      }
    >
      <Course {...props} />
    </Suspense>
  );
}

async function Course({ params }: PageProps<"/gyms/[slug]/learn/[assignment]">) {
  const { slug, assignment: rawId } = await params;
  const ctx = await learnerGym(slug);
  const detail = await myAssignment(ctx, rawId);
  const back = { href: `/gyms/${ctx.org.slug}/learn`, label: "Your courses" };
  if (!detail.available) {
    return (
      <LearnShell gym={ctx.org.name} back={back}>
        <VersionUnavailable versionNumber={detail.versionNumber} />
      </LearnShell>
    );
  }
  const { view } = detail;
  const base = `/gyms/${ctx.org.slug}/learn/${detail.assignmentId}`;
  const parts = groupByPart(view.lessons);
  const hasQuiz = detail.version.gradedQuiz && learnerQuestions(detail.version.learnerCourse).length > 0;
  const status = await loadModuleStatus(ctx, detail.assignmentId);

  return (
    <LearnShell gym={ctx.org.name} back={back}>
      <div data-layout="column" className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="flex flex-col gap-3">
          <p className="flex flex-wrap items-center gap-2">
            <LayerLabel layer={view.layer} />
            <VersionTag n={view.versionNumber} />
          </p>
          <h1 className="text-heading font-medium">{view.title}</h1>
          {view.subtitle ? <p className="text-reading text-text-muted">{view.subtitle}</p> : null}
          <div className="flex flex-col gap-2">
            <ProgressText done={view.done} total={view.total} />
            <ProgressBar done={view.done} total={view.total} />
          </div>
        </header>

        {view.flaggedClaimIds.length > 0 ? (
          <IntegrityAlert title="A source cited in this version was retracted after it was published">
            The affected blocks are marked. Read them with that in mind. Your completion and credit stay as they are.
          </IntegrityAlert>
        ) : null}

        {view.next ? (
          <Link
            href={`${base}/${view.next.slug}`}
            className="inline-flex min-h-12 items-center gap-2 self-start rounded-control bg-ink px-5 font-medium text-white hover:bg-ink-hover"
          >
            {view.done === 0 ? "Start course" : "Resume lesson"}
            <ArrowRight aria-hidden strokeWidth={1.75} className="size-4" />
          </Link>
        ) : (
          <p className="rounded-card bg-surface-muted p-4 font-medium">You completed every lesson in v{view.versionNumber}.</p>
        )}

        <ModuleStatusCard status={status} quizHref={hasQuiz ? moduleQuizHref(base) : null} />

        {view.delta ? <VersionNotice delta={view.delta} versionNumber={view.versionNumber} credited={view.lessons.some((l) => l.state === "credited")} /> : null}

        {parts.map(({ partId, title, lessons }) => (
          <section key={partId} className="flex flex-col gap-2">
            <h2 className="text-lg font-medium">{title}</h2>
            <ol data-testid="lesson-list" className="flex flex-col divide-y divide-border rounded-card border border-border bg-surface">
              {lessons.map((lesson) => (
                <li key={lesson.id}>
                  <Link href={`${base}/${lesson.slug}`} className="flex flex-col gap-1 p-4 hover:bg-surface-muted md:flex-row md:items-start md:justify-between md:gap-6">
                    <span className="flex flex-col gap-0.5">
                      <span data-testid="lesson-title" className="font-medium">{lesson.title}</span>
                      <span className="text-label text-text-muted">
                        {lesson.durationMinutes} min · {lesson.format}
                        {lesson.flagged ? <span className="font-medium text-caution"> · Source retracted</span> : null}
                      </span>
                      <span className="text-label text-text-muted">
                        <LessonStateDetail lesson={lesson} />
                      </span>
                    </span>
                    <LessonStateLabel lesson={lesson} />
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </LearnShell>
  );
}


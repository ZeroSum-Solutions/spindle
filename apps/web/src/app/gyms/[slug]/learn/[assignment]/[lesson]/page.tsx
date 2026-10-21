import { moduleQuizHref } from "@/lib/learning/quiz";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { LessonBlocks, LessonMedia, LessonResources } from "@/components/learn/blocks";
import { CoachNote } from "@/components/brand/coach-note";
import { CompleteLesson } from "@/components/learn/complete-lesson";
import { IntegrityAlert, LayerLabel, LessonStateDetail, SupportLegend, VersionTag } from "@/components/learn/labels";
import { receiptLine } from "@/lib/learning/presentation";
import { LessonDock } from "@/components/learn/lesson-dock";
import { LessonOutline } from "@/components/learn/outline";
import { ProgressTrack, segmentsOf } from "@/components/learn/progress-track";
import { LearnShell, LoadingNote, VersionUnavailable } from "@/components/learn/shell";
import { completeLesson, type CompleteState, type LessonRoute } from "@/lib/learning/complete";
import { claimEvidence, learnerGym, lessonClaimIds, myAssignment } from "@/lib/learning/load";
import { lessonsOf } from "@/lib/learning/view";
import { versionMedia } from "@/lib/learning/version-media";
import { versionIntegrity } from "@/lib/learning/integrity";

const FORMAT: Record<string, string> = { article: "Article", video: "Video", diagram: "Diagram", practice: "Practice", quiz: "Quiz" };

export default function LessonPage(props: PageProps<"/gyms/[slug]/learn/[assignment]/[lesson]">) {
  return (
    <Suspense
      fallback={
        <LearnShell frame="reading">
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
  // One id per render for the outline sheet and its triggers: the router may keep an earlier page hidden.
  const sheetId = `outline-${randomUUID()}`;
  const hasVideo = lesson.blocks.some((b) => b.kind === "video");
  const hasScience = lesson.blocks.some((b) => "support" in b && b.support === "science");
  const [claims, media, integrity] = await Promise.all([
    claimEvidence(ctx, lessonClaimIds(version, lesson.id)),
    hasVideo ? versionMedia(ctx, version.id) : Promise.resolve(new Map()),
    hasScience ? versionIntegrity(ctx, version.id, lesson.id) : Promise.resolve(new Map()),
  ]);
  const prev = lessons[index - 1];
  const next = lessons[index + 1];
  const done = state.state === "done" || state.state === "credited";

  return (
    <LearnShell
      gym={ctx.org.name}
      back={{ href: courseHref, label: view.title }}
      frame="reading"
      dock={
        <LessonDock sheetId={sheetId} next={next ? { href: `${courseHref}/${next.slug}`, title: next.title } : { href: courseHref }}>
          <ProgressTrack segments={segmentsOf(view.lessons, index)} />
        </LessonDock>
      }
    >
      <div data-layout="reading" className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_minmax(0,46rem)] lg:justify-center">
        <div className="lg:sticky lg:top-6 lg:self-start">
          <LessonOutline view={view} base={courseHref} currentId={lesson.id} phone="sheet" sheetId={sheetId} />
        </div>
        <article className="flex min-w-0 max-w-[46rem] flex-col gap-8 text-reading" aria-labelledby="lesson-title">
          <header className="flex flex-col gap-3">
            <p className="flex flex-wrap items-center gap-2 text-label text-text-muted">
              <LayerLabel layer={view.layer} />
              <VersionTag n={view.versionNumber} />
              <span>
                Lesson {index + 1} of {lessons.length} · {state.partTitle}
              </span>
            </p>
            <h1 id="lesson-title" className="text-heading-lesson text-text">
              {lesson.title}
            </h1>
            <p className="text-label text-text-muted">
              {lesson.durationMinutes} min · {FORMAT[lesson.format]}
            </p>
            {lesson.summary ? <p className="text-text-muted">{lesson.summary}</p> : null}
          </header>

          {/* A gym course's live welcome note opens its first lesson (practice-based, frozen name). */}
          {index === 0 && detail.texts.welcome ? <CoachNote note={detail.texts.welcome} /> : null}

          {integrity === null ? (
            <IntegrityAlert title="We could not check the evidence status of this lesson right now">
              Until it is checked, its research statements are not labelled as science. Their sources stay listed. Reload the page to check again.
            </IntegrityAlert>
          ) : null}

          {state.flagged ? (
            <IntegrityAlert title="A source in this lesson was retracted after publishing">
              The affected blocks are marked &quot;Source retracted&quot;. Your completion and credit stay as they are.
            </IntegrityAlert>
          ) : null}

          {lesson.objectives.length > 0 ? (
            <section className="border-t border-border pt-4">
              <h2 className="text-label font-medium text-text-muted">In this lesson you will</h2>
              <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-base">
                {lesson.objectives.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <SupportLegend supports={lesson.blocks.flatMap((b) => ("support" in b ? [b.support] : []))} />

          <LessonBlocks blocks={lesson.blocks} ctx={{ orgId: version.orgId, claims, flagged, media, quizHref: moduleQuizHref(courseHref), gradedQuiz: version.gradedQuiz, versionId: version.id, integrity }} />
          <LessonMedia media={lesson.media} orgId={version.orgId} />
          <LessonResources resources={lesson.resources} orgId={version.orgId} />

          <section aria-label="Lesson completion" className="flex flex-col gap-3 border-t border-border pt-6 text-base">
            <CompleteLesson
              complete={completeAction({ gym: ctx.org.slug, assignmentId: detail.assignmentId, lessonId: lesson.id })}
              done={done}
              next={next ? { href: `${courseHref}/${next.slug}`, label: `Next: ${next.title}` } : { href: courseHref, label: "Back to the course" }}
              receipt={
                done ? (
                  <ReceiptText line={receiptLine(state, view.versionNumber)} />
                ) : state.state === "updated" ? (
                  <LessonStateDetail lesson={state} />
                ) : null
              }
            />
          </section>

          {/* Below 1024px the named next action lives in the lesson bar, so only previous stays here (a small link).
              From 1024px there is no bar: previous and next share this row. */}
          <nav aria-label="Lesson navigation" className={`flex-row items-center justify-between gap-3 text-base ${prev ? "flex" : "hidden lg:flex"}`}>
            {prev ? (
              <Link href={`${courseHref}/${prev.slug}`} className="inline-flex min-h-11 items-center gap-1.5 text-label text-brand hover:text-brand-hover">
                <ArrowLeft aria-hidden strokeWidth={1.75} className="size-4 shrink-0" />
                <span>
                  <span className="sr-only">Previous lesson: </span>
                  {prev.title}
                </span>
              </Link>
            ) : (
              <span className="hidden lg:block" />
            )}
            {next ? (
              <Link
                href={`${courseHref}/${next.slug}`}
                className="hidden min-h-12 max-w-[60%] flex-col items-end justify-center rounded-control border border-control bg-surface px-4 py-2 text-right hover:bg-surface-muted lg:flex"
              >
                <span className="text-label text-text-muted">Next lesson</span>
                <span data-next-title className="inline-flex items-center gap-1.5 font-medium text-text">
                  {next.title}
                  <ArrowRight aria-hidden strokeWidth={1.75} className="size-4 shrink-0" />
                </span>
              </Link>
            ) : (
              <Link href={courseHref} className="hidden min-h-11 items-center gap-1.5 text-brand hover:text-brand-hover lg:inline-flex">
                Back to the course
              </Link>
            )}
          </nav>
        </article>
      </div>
    </LearnShell>
  );
}

/**
 * A completion action bound to this rendered lesson. The route values live in the
 * action's closure, which Next encrypts; the client can call it but cannot change
 * which gym, assignment or lesson it completes.
 */
function completeAction(route: LessonRoute) {
  return async function complete(): Promise<CompleteState> {
    "use server";
    return completeLesson(route);
  };
}

function ReceiptText({ line }: { line: { lead: string; detail: string } | null }) {
  if (!line) return null;
  return (
    <>
      <span className="font-medium">{line.lead}</span> <span className="text-text-muted">· {line.detail}</span>
    </>
  );
}

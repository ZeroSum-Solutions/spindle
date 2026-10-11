import { Suspense } from "react";
import { gradedQuestions } from "@spindle/engine";
import { LayerLabel, VersionTag } from "@/components/learn/labels";
import { ModuleQuiz } from "@/components/learn/module-quiz";
import { ModuleStatusCard } from "@/components/learn/module-status";
import { LearnShell, LoadingNote, VersionUnavailable } from "@/components/learn/shell";
import { learnerGym, myAssignment } from "@/lib/learning/load";
import { questionViews, type QuizState } from "@/lib/learning/quiz";
import { loadModuleStatus, submitQuiz, type QuizRoute } from "@/lib/learning/quiz-server";
import { lessonsOf } from "@/lib/learning/view";

// The module quiz lives two segments below the course (module/quiz), so it can never shadow a
// lesson: lesson routes are exactly one segment, whatever the lesson's slug.
export default function QuizPage(props: PageProps<"/gyms/[slug]/learn/[assignment]/module/quiz">) {
  return (
    <Suspense
      fallback={
        <LearnShell>
          <LoadingNote>Loading the quiz…</LoadingNote>
        </LearnShell>
      }
    >
      <Quiz {...props} />
    </Suspense>
  );
}

async function Quiz({ params }: PageProps<"/gyms/[slug]/learn/[assignment]/module/quiz">) {
  const { slug, assignment: rawId } = await params;
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
  // Only versions published under the phase-3 rules have a graded quiz; older ones keep the lesson self-checks.
  const questions = version.gradedQuiz ? gradedQuestions(version.course) : [];
  const titles = new Map(lessonsOf(version.course).map((l) => [l.id, l.title]));
  const status = await loadModuleStatus(ctx, detail.assignmentId);

  return (
    <LearnShell gym={ctx.org.name} back={{ href: courseHref, label: view.title }}>
      <div data-layout="column" className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="flex flex-col gap-3">
          <p className="flex flex-wrap items-center gap-2">
            <LayerLabel layer={view.layer} />
            <VersionTag n={view.versionNumber} />
          </p>
          <h1 className="text-heading font-medium">Module quiz</h1>
          <p className="text-reading text-text-muted">{view.title}</p>
        </header>
        <ModuleStatusCard status={status} quizHref={null} />
        {questions.length === 0 ? (
          <p className="rounded-card border border-border bg-surface p-4 text-text-muted">This course version has no graded quiz.</p>
        ) : (
          <ModuleQuiz questions={questionViews(questions, titles)} submit={submitAction({ gym: ctx.org.slug, assignmentId: detail.assignmentId })} />
        )}
      </div>
    </LearnShell>
  );
}

/**
 * A submit action bound to this rendered quiz. The route values live in the action's
 * closure, which Next encrypts; the client can call it but cannot change which gym or
 * assignment it submits for.
 */
function submitAction(route: QuizRoute) {
  return async function submit(_prev: QuizState, form: FormData): Promise<QuizState> {
    "use server";
    return submitQuiz(route, form);
  };
}

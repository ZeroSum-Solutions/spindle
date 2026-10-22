import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { LessonBlocks } from "@/components/learn/blocks";
import { LayerLabel, SupportLegend, VersionTag } from "@/components/learn/labels";
import { ModuleStatusCard } from "@/components/learn/module-status";
import { LessonDock } from "@/components/learn/lesson-dock";
import { LessonOutline } from "@/components/learn/outline";
import { ProgressTrack, segmentsOf } from "@/components/learn/progress-track";
import { LearnShell } from "@/components/learn/shell";
import { MeasurementSpecimen, StopReferSpecimen } from "../../foundations-board";
import { blocks, claims, FLAGGED, SPECIMEN_INTEGRITY, view } from "../../specimen-data";
import { ScreenQuiz, ScreenCompletion } from "./screen-parts";

// Full-page specimen screens for the kit's Screens part, development only: the real learner components
// with synthetic data, as a member would see them. Production builds answer 404, like /design.

export const metadata: Metadata = { title: "Design screen (development only)", robots: { index: false } };

const SCREENS = ["lesson", "quiz", "complete"] as const;
type Screen = (typeof SCREENS)[number];

export default function DesignScreenPage({ params }: { params: Promise<{ screen: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  // The route reads its params at request time, so it renders behind Suspense (cache components).
  return (
    <Suspense fallback={null}>
      <DesignScreen params={params} />
    </Suspense>
  );
}

async function DesignScreen({ params }: { params: Promise<{ screen: string }> }) {
  const { screen } = await params;
  if (!SCREENS.includes(screen as Screen)) notFound();
  const back = { href: "/design#screens", label: "Design kit" };
  if (screen === "lesson") {
    return (
      <LearnShell
        gym="Synthetic gym"
        back={back}
        frame="reading"
        dock={
          <LessonDock sheetId="design-outline-sheet" next={{ href: "/design/screens/lesson", title: view.lessons[2]!.title }}>
            <ProgressTrack segments={segmentsOf(view.lessons, 1)} />
          </LessonDock>
        }
      >
        <div data-layout="reading" className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_minmax(0,46rem)] lg:justify-center">
          <div className="lg:sticky lg:top-6 lg:self-start">
            {/* The sidebar scrolls inside itself, so focus moved to a late lesson scrolls the reading column at most by
                the part of the box below the window; at the box's end the wheel carries on to the window (no
                overscroll containment), so its last lessons stay in reach. The inset keeps focus rings unclipped. */}
            <div data-outline-scroll className="lg:-m-2 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto lg:p-2">
              <LessonOutline view={view} base="/design/screens" currentId="l2" phone="sheet" sheetId="design-outline-sheet" />
            </div>
          </div>
          <article className="flex min-w-0 max-w-[46rem] flex-col gap-8 text-reading" aria-labelledby="lesson-title">
            <header className="flex flex-col gap-3">
              <p className="flex flex-wrap items-center gap-2 text-label text-text-muted">
                <LayerLabel layer="base" />
                <VersionTag n={2} />
                <span>Lesson 2 of 5 · Part one</span>
              </p>
              <h1 id="lesson-title" className="text-heading-lesson text-text">
                Synthetic lesson 2
              </h1>
            </header>
            <SupportLegend supports={["science", "practice-based"]} />
            <LessonBlocks blocks={blocks} ctx={{ orgId: null, claims, flagged: new Set([FLAGGED]), integrity: SPECIMEN_INTEGRITY }} />
            <StopReferSpecimen />
          </article>
        </div>
      </LearnShell>
    );
  }
  if (screen === "quiz") {
    return (
      <LearnShell gym="Synthetic gym" back={back}>
        <h1 className="text-heading text-text">Module quiz</h1>
        <ScreenQuiz />
      </LearnShell>
    );
  }
  return (
    <LearnShell gym="Synthetic gym" back={back}>
      <h1 className="text-heading text-text">Module complete</h1>
      <MeasurementSpecimen done={8} total={8} />
      <ModuleStatusCard
        status={{ assignmentId: "as1", versionId: "v1", lessonsTotal: 8, lessonsCompleted: 8, quizRequired: true, questionsTotal: 20, bestAttemptId: "a2", bestCorrect: 18, bestTotal: 20, quizPassed: true, quizCreditAttemptId: "a2", quizCarried: false, complete: true }}
        quizHref="/design/screens/quiz"
      />
      <ScreenCompletion />
    </LearnShell>
  );
}

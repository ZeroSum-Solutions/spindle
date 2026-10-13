import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LessonBlocks, LessonResources } from "@/components/learn/blocks";
import { CourseRow } from "@/components/learn/course-row";
import { ReviewedDiagram } from "@/components/learn/diagrams";
import { IntegrityAlert, LayerLabel, LessonStateLabel, SupportLabel, SupportLegend, VersionTag } from "@/components/learn/labels";
import { ModuleStatusCard } from "@/components/learn/module-status";
import { LessonOutline } from "@/components/learn/outline";
import { ProgressTrack } from "@/components/learn/progress-track";
import { VersionUnavailable } from "@/components/learn/shell";
import { VersionNotice } from "@/components/learn/version-notice";
import { YouTubeSegment } from "@/components/learn/youtube-segment";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button, ErrorNote, Field } from "@/components/ui";
import { specimenRecheck } from "./actions";
import { BrandInUseBoard } from "./brand-in-use";
import { DIAGRAM_SAMPLES } from "./diagram-samples";
import { ChecksBoard, ColourBoard, LogoBoard, MeasurementSpecimen, StopReferSpecimen, TokensBoard, TypeBoard } from "./foundations-board";
import { KitCard, KitMasthead, KitNav, KitPart, ThemePair } from "./kit";
import { CompletionBoard, LogoReveal } from "./motion-board";
import { MotionTokens } from "./motion-tokens";
import { QuizBoard } from "./quiz-board";
import { blocks, claims, FLAGGED, SPECIMEN_CARD, SPECIMEN_INTEGRITY, view } from "./specimen-data";

// The Spindle Lab design kit, development only. It mounts the real tokens and learner components with
// synthetic props, in Lab Light and Lab Dark side by side: no database, no real curriculum, nothing
// saved. Production builds answer 404 (asserted in e2e/player.spec.ts).

export const metadata: Metadata = { title: "Spindle Lab design kit (development only)", robots: { index: false } };

/** The key screens, each linked in both themes (?theme= sets and keeps the theme). */
const SCREENS = [
  { name: "Landing", href: "/" },
  { name: "For coaches", href: "/coaches" },
  { name: "Sign in", href: "/sign-in" },
  { name: "Member catalog (synthetic gyms)", href: "/brand-preview" },
  { name: "Lesson player", href: "/design/screens/lesson" },
  { name: "Module quiz", href: "/design/screens/quiz" },
  { name: "Module complete", href: "/design/screens/complete" },
] as const;

const COMPLETE_STATUS = { assignmentId: "as1", versionId: "v1", lessonsTotal: 8, lessonsCompleted: 8, quizRequired: true, questionsTotal: 20, bestAttemptId: "a2", bestCorrect: 18, bestTotal: 20, quizPassed: true, quizCreditAttemptId: "a2", quizCarried: false, complete: true };
const PARTIAL_STATUS = { ...COMPLETE_STATUS, lessonsCompleted: 6, bestAttemptId: "a1", bestCorrect: 15, quizPassed: false, quizCreditAttemptId: null, complete: false };

export default function DesignKit() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <>
      <KitMasthead />
      <KitNav />
      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-section px-4 pb-hero md:px-8">
        <KitPart
          id="direction"
          title="Instruments, measured, in two themes"
          lead="Midnight ground and graphite instruments in dark; soft grey and white with graphite ink in light. One signal colour, magenta, marks where you are and the moments that matter. Everything else is measured: ticks, mono readouts, numeric progress. Reading stays calm: Plex Sans at 18px, a 66-character measure."
        >
          <ThemePair>
            <div className="flex flex-col gap-stack">
              <p className="text-eyebrow text-signal">Lesson 03 / 08</p>
              <p className="text-title text-text">Scapulohumeral rhythm</p>
              <MeasurementSpecimen />
              <p className="text-reading text-text">
                Three bones make the shoulder: the upper arm bone, the shoulder blade and the collarbone. This sample shows the reading face on the theme&apos;s
                canvas.
              </p>
              <div className="flex flex-wrap gap-tight">
                <SupportLabel support="science" />
                <SupportLabel support="practice-based" />
              </div>
              <StopReferSpecimen />
            </div>
          </ThemePair>
        </KitPart>

        <KitPart id="logo" title="The Cut, redrawn wide" lead="The Cut wordmark in Archivo at its widest: a cut through the d ascender, a solid l, a cut through the square i dot. The cut d is the symbol.">
          <LogoBoard />
        </KitPart>

        <KitPart
          id="colour"
          title="Two themes, one signal"
          lead="Every colour is a light-dark pair. Evidence colours are Spindle's in both themes and no gym can change them. Each pair below is computed live with the WCAG 2.2 formula."
        >
          <ColourBoard />
        </KitPart>

        <KitPart id="type" title="Wide display, calm reading, mono data" lead="Archivo at its widest for display, IBM Plex Sans for the interface and long reading, IBM Plex Mono for every number and readout. All SIL OFL 1.1, self-hosted.">
          <TypeBoard />
        </KitPart>

        <KitPart id="tokens" title="Spacing, shape and depth" lead="An 8-point scale with names; tight, instrument-like radii; surfaces that layer by tone, with shadows only on floating layers.">
          <TokensBoard />
        </KitPart>

        <KitPart id="components" title="Components and their states" lead="The real components, in both themes. Touch targets are 44px or more; focus is a 3px ring in the brand colour, offset from the control.">
          <KitCard n={1} title="Theme toggle" note="In every header. The system setting decides until the reader chooses; the choice is kept and applied before first paint.">
            <div>
              <ThemeToggle />
            </div>
          </KitCard>
          <KitCard n={2} title="Button" note="Primary is ink, which inverts with the theme; one per screen. Loading keeps the width.">
            <ThemePair>
              <div className="flex flex-wrap gap-tight">
                <Button>Complete and continue</Button>
                <Button variant="secondary">Outline</Button>
                <Button variant="ghost">Skip to sources</Button>
                <Button loading>Saving</Button>
                <Button disabled>Not yet</Button>
              </div>
            </ThemePair>
          </KitCard>
          <KitCard n={3} title="Field" note="Hint and error are announced with the input; an error draws the danger edge.">
            <ThemePair>
              <div className="flex flex-col gap-stack">
                <Field label="Gym name" name="name" hint="Shown to your trainers." defaultValue="Synthetic gym" />
                <Field label="Invite email" name="email" error="Enter an email address." defaultValue="trainer@" />
              </div>
            </ThemePair>
          </KitCard>
          <KitCard n={4} title="Labels" note="Evidence is word, colour and shape. Layers and lesson states are ink with an icon.">
            <ThemePair>
              <div className="flex flex-wrap items-center gap-attach">
                <SupportLabel support="science" />
                <SupportLabel support="practice-based" />
                <LayerLabel layer="base" />
                <LayerLabel layer="modality" />
                <LayerLabel layer="method" />
                <VersionTag n={3} />
                {(["done", "credited", "updated", "new", "todo"] as const).map((s) => (
                  <LessonStateLabel key={s} lesson={{ state: s }} />
                ))}
              </div>
            </ThemePair>
          </KitCard>
          <KitCard n={5} title="Notices">
            <ThemePair>
              {(theme) => (
                <div className="flex flex-col gap-stack">
                  <VersionNotice delta={view.delta!} versionNumber={2} titleId={`changes-title-${theme}`} />
                  <IntegrityAlert title="A source cited in this version was retracted after it was published">
                    The affected blocks are marked. Read them with that in mind. Your completion and credit stay as they are.
                  </IntegrityAlert>
                  <VersionUnavailable versionNumber={4} />
                  <ErrorNote message="Synthetic form error message." />
                </div>
              )}
            </ThemePair>
          </KitCard>
          <KitCard n={6} title="Stop and refer" note="The loudest element in each theme: inverted against the page, with the red stop stripe. Never animated. The full safety panel lands with the learner screens.">
            <ThemePair>
              <StopReferSpecimen />
            </ThemePair>
          </KitCard>
          <KitCard n={7} title="Course rows">
            <ThemePair>
              <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-surface">
                <li>
                  <CourseRow
                    item={{ id: "a2", courseId: "c1", versionNumber: 2, available: true, view, card: SPECIMEN_CARD }}
                    earlier={[{ id: "a1", courseId: "c1", versionNumber: 1, available: true, view: { ...view, versionNumber: 1, done: 3, total: 3 }, card: SPECIMEN_CARD }]}
                    base="/design"
                  />
                </li>
                <li>
                  <CourseRow item={{ id: "a4", courseId: "c2", available: false, versionNumber: 4 }} base="/design" />
                </li>
              </ul>
            </ThemePair>
          </KitCard>
          <KitCard n={8} title="Lesson player" note="Outline and reading column with every block kind: science, practice-based, callout, checklist, figures, diagrams and a self-check.">
            <ThemePair wide>
              {(theme) => (
                <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_minmax(0,46rem)]">
                  <div className="lg:self-start">
                    <LessonOutline view={view} base="/design" currentId="l2" />
                  </div>
                  <div className="flex min-w-0 flex-col gap-8 text-reading">
                    <SupportLegend supports={["science", "practice-based"]} />
                    <LessonBlocks blocks={blocks} ctx={{ orgId: null, claims, flagged: new Set([FLAGGED]), integrity: SPECIMEN_INTEGRITY, idPrefix: `${theme}-` }} />
                    <LessonResources
                      resources={[
                        { label: "Synthetic external reference", href: "https://example.org/synthetic", type: "reference" },
                        { label: "Synthetic worksheet", href: "/worksheets/synthetic.pdf", type: "worksheet" },
                      ]}
                      orgId={null}
                    />
                  </div>
                </div>
              )}
            </ThemePair>
          </KitCard>
          <KitCard n={9} title="Reviewed diagrams (sample text)">
            <ThemePair>
              <div data-specimen="diagrams" className="flex flex-col gap-8">
                {DIAGRAM_SAMPLES.map((content) => (
                  <ReviewedDiagram key={content.diagramId} content={content} />
                ))}
              </div>
            </ThemePair>
          </KitCard>
          <KitCard n={10} title="Graded quiz states">
            <ThemePair>
              <QuizBoard />
            </ThemePair>
          </KitCard>
          <KitCard n={11} title="Video (click to load)" note="Nothing loads from YouTube until Play is pressed. The player panel stays midnight in both themes. The first clip plays; the second is unavailable at the provider; the third is switched off in the registry.">
            <div className="grid max-w-[46rem] grid-cols-1 gap-10">
              <YouTubeSegment
                recheck={specimenRecheck}
                segment={{ mediaId: "m-demo", provider: "youtube", videoId: "M7lc1UVf-VE", startSeconds: 0, endSeconds: 30, rationale: "Synthetic rationale: shows how a coaching segment sits beside lesson text.", caption: "" }}
                availability={{ mediaId: "m-demo", state: "playable", review: "model-described", title: "Specimen clip: YouTube IFrame API demo", channel: "YouTube API demo", available: true }}
              />
              <YouTubeSegment
                recheck={specimenRecheck}
                segment={{ mediaId: "m-gone", provider: "youtube", videoId: "000000000aa", startSeconds: 5, endSeconds: 20, rationale: "Synthetic rationale: the provider reports this clip as unavailable.", caption: "" }}
                availability={{ mediaId: "m-gone", state: "playable", review: "model-described", title: null, channel: null, available: false }}
              />
              <YouTubeSegment
                recheck={specimenRecheck}
                segment={{ mediaId: "m-off", provider: "youtube", videoId: "000000000bb", startSeconds: 5, endSeconds: 20, rationale: "Synthetic rationale: the registry has switched this clip off.", caption: "" }}
                availability={{ mediaId: "m-off", state: "disabled", review: null, title: null, channel: null, available: null }}
              />
            </div>
          </KitCard>
          <KitCard n={12} title="Progress track" note="The measurement layer as a readout: position, one segment per lesson (done ink, current signal, the rest hairlines) and the share done. The words are for assistive technology; the segments are decorative.">
            <ThemePair>
              <div className="flex flex-col gap-stack">
                <ProgressTrack segments={["done", "done", "current", "rest", "rest", "rest", "rest", "rest"]} />
                <ProgressTrack segments={["done", "done", "done", "done"]} />
              </div>
            </ThemePair>
          </KitCard>
          <KitCard
            n={13}
            title="Lesson bar and outline sheet"
            note="The bottom lesson bar holds the progress track and, below 1024px, the Outline button; it has automatic height and the page reserves it. The outline opens as a bottom sheet (a modal dialog): Tab cycles inside, Esc closes, focus returns to the trigger."
          >
            <p className="text-label">
              <Link href="/design/screens/lesson" className="text-brand underline underline-offset-2 hover:text-brand-hover">
                Open the lesson screen
              </Link>{" "}
              <span className="text-text-muted">(try it at 390px and with the toggle).</span>
            </p>
          </KitCard>
        </KitPart>

        <KitPart id="screens" title="Key screens, light and dark" lead="Each link opens the real route with ?theme=, which sets and keeps the theme. The learner screens use synthetic data under /design/screens.">
          <ul data-kit-screens className="grid grid-cols-1 gap-stack md:grid-cols-2">
            {SCREENS.map((s) => (
              <li key={s.href} className="flex flex-col gap-tight rounded-card border border-border bg-surface p-stack">
                <span className="text-ui font-semibold text-text">{s.name}</span>
                <span className="flex flex-wrap gap-tight">
                  {(["light", "dark"] as const).map((t) => (
                    <a key={t} href={`${s.href}?theme=${t}`} className="inline-flex min-h-11 items-center rounded-control border border-control px-3 text-label text-text hover:bg-surface-muted">
                      {t === "light" ? "Light" : "Dark"}
                      <span className="sr-only">: {s.name}</span>
                    </a>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </KitPart>

        <KitPart id="motion" title="Kinetic, with a purpose" lead="Motion confirms and orients. Only transform, opacity and stroke move; reduced motion shows the finished state at once. Nothing loops.">
          <MotionTokens />
          <ThemePair>
            <CompletionBoard />
          </ThemePair>
          <LogoReveal />
        </KitPart>

        <KitPart id="brand" title="Brand in use" lead="A gym's brand lives in its zone: the header band, its own course cards and links. Evidence labels, errors, safety and the base attribution stay Spindle's.">
          <BrandInUseBoard />
        </KitPart>

        <KitPart id="progress" title="Progress through structure" lead="Rewards come from structure and mastery: lesson counts, module status and a passed quiz. No points, leaderboards or streaks; safety content is never skippable.">
          <ThemePair>
            {(theme) => (
              <div className="flex flex-col gap-stack">
                <MeasurementSpecimen done={0} total={8} />
                <MeasurementSpecimen done={5} total={8} />
                <ModuleStatusCard status={PARTIAL_STATUS} quizHref="/design/screens/quiz" titleId={`status-partial-${theme}`} />
                <ModuleStatusCard status={COMPLETE_STATUS} quizHref="/design/screens/quiz" titleId={`status-complete-${theme}`} />
              </div>
            )}
          </ThemePair>
        </KitPart>

        <KitPart id="checks" title="Checks" lead="What is checked automatically. The kit's numbers are computed on this page; the browser checks run in Playwright.">
          <ChecksBoard />
        </KitPart>
      </main>
    </>
  );
}

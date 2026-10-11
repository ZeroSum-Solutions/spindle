import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ClaimIntegrityState, LessonBlock } from "@spindle/schema";
import { LessonBlocks, LessonMedia, LessonResources } from "@/components/learn/blocks";
import { CourseRow } from "@/components/learn/course-row";
import { IntegrityAlert, LayerLabel, LessonStateLabel, SupportLabel, SupportLegend, VersionTag } from "@/components/learn/labels";
import { LessonOutline } from "@/components/learn/outline";
import { LearnShell, VersionUnavailable } from "@/components/learn/shell";
import { VersionNotice } from "@/components/learn/version-notice";
import { YouTubeSegment } from "@/components/learn/youtube-segment";
import { ErrorNote } from "@/components/ui";
import type { ClaimView } from "@/lib/learning/load";
import type { CourseView, LessonView } from "@/lib/learning/view";
import { ReviewedDiagram } from "@/components/learn/diagrams";
import { DIAGRAM_SAMPLES } from "./diagram-samples";
import { CompletionBoard, LogoReveal } from "./motion-board";
import { BrandPreview } from "./brand-preview";
import { QuizBoard } from "./quiz-board";
import { ModuleStatusCard } from "@/components/learn/module-status";

// Design specimen for development only. It mounts the real learner components with
// synthetic props: no database, no real curriculum, nothing saved. Production
// builds answer 404 (asserted in e2e/player.spec.ts).

export const metadata: Metadata = { title: "Design specimen (development only)", robots: { index: false } };

const CLAIM = "00000000-0000-4000-8000-0000000000c1";
const FLAGGED = "00000000-0000-4000-8000-0000000000c2";
// The integrity report the specimen blocks render against (synthetic).
const SPECIMEN_INTEGRITY = new Map<string, ClaimIntegrityState>([
  [CLAIM, "current"],
  [FLAGGED, "retracted"],
]);

const claims = new Map<string, ClaimView>([
  [
    CLAIM,
    {
      id: CLAIM,
      statement: "Synthetic claim: this sentence stands in for an approved statement about a joint.",
      evidenceLevel: "Synthetic: systematic review",
      population: "Synthetic: healthy adults",
      sources: [
        { id: "s1", kind: "systematic_review", title: "Synthetic review title", doi: "10.0000/synthetic.0001", pmid: null, url: null, locator: null, license: "Synthetic", retractedAt: null },
      ],
    },
  ],
  [
    FLAGGED,
    {
      id: FLAGGED,
      statement: "Synthetic claim whose source was later retracted.",
      evidenceLevel: "Synthetic: randomized trial",
      population: "Synthetic: trained adults",
      sources: [
        { id: "s2", kind: "textbook", title: "Synthetic textbook", doi: null, pmid: "12345678", url: null, locator: "Synthetic ed., p. 1", license: "Synthetic", retractedAt: "2026-10-09T12:00:00+00:00" },
      ],
    },
  ],
]);

const blocks: LessonBlock[] = [
  { kind: "heading", content: "Synthetic heading" },
  { kind: "paragraph", content: "A science paragraph in reading type. It binds one approved synthetic claim, so it shows the Science label and its sources.", support: "science", claimIds: [CLAIM] },
  { kind: "paragraph", content: "A practice-based paragraph. It carries no claim, so it says it comes from coaching practice.", support: "practice-based", claimIds: [] },
  { kind: "callout", content: { label: "Coach note", text: "A synthetic callout block." }, support: "practice-based", claimIds: [] },
  { kind: "checklist", content: ["First synthetic step", "Second synthetic step"], support: "science", claimIds: [FLAGGED] },
  { kind: "image", content: { kind: "image", src: "/media/content/synthetic/missing.png", alt: "Synthetic missing figure", caption: "A storage figure that is not available.", provenanceId: "synthetic" } },
  { kind: "diagram", content: { diagramId: "synthetic-diagram", caption: "A diagram block without an asset yet." } },
  { kind: "diagram", content: { diagramId: "shoulder-complex-front", caption: "Original diagram: the shoulder complex from the front." } },
  { kind: "diagram", content: { diagramId: "scapula-upward-rotation", caption: "Original diagram: upward rotation of the shoulder blade." } },
  {
    kind: "quiz",
    content: { prompt: "Synthetic self-check: which option is right?", options: ["Option A", "Option B", "Option C"], answerIndex: 1, explanation: "Option B is the synthetic answer." },
    support: "science",
    claimIds: [CLAIM],
  },
];

const lesson = (n: number, state: LessonView["state"], extra: Partial<LessonView> = {}): LessonView => ({
  id: `l${n}`,
  slug: `synthetic-lesson-${n}`,
  title: `Synthetic lesson ${n}`,
  partId: "p1",
  partTitle: "Part one",
  durationMinutes: 6,
  format: "article",
  state,
  flagged: false,
  ...extra,
});

const view: CourseView = {
  title: "Synthetic course",
  subtitle: "Specimen data only",
  layer: "base",
  versionNumber: 2,
  lessons: [
    lesson(1, "credited", { completedAt: "2026-10-01T10:00:00+00:00", origin: { completedAt: "2026-10-01T10:00:00+00:00", versionNumber: 1 } }),
    lesson(2, "updated", { flagged: true }),
    lesson(3, "new"),
    lesson(4, "todo"),
    lesson(5, "done", { completedAt: "2026-10-10T10:00:00+00:00" }),
  ],
  done: 2,
  total: 5,
  complete: false,
  next: null,
  flaggedClaimIds: [FLAGGED],
  delta: { fromVersionNumber: 1, changed: ["Synthetic lesson 2"], added: ["Synthetic lesson 3"], removed: ["Retired synthetic lesson"] },
};

/** The specimen has no real version to recheck against; in development it always allows play. */
async function specimenRecheck(): Promise<boolean> {
  "use server";
  return process.env.NODE_ENV !== "production";
}

export default function DesignSpecimen() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <LearnShell gym="Synthetic gym" frame="reading">
      <p role="note" className="rounded-small bg-brand-soft px-3 py-2 text-label font-medium text-brand">
        Design specimen, development only. Synthetic data; nothing here is saved or real curriculum.
      </p>

      <Section title="Brand">
        <div className="flex flex-wrap items-end gap-8">
          {[120, 160, 240].map((w) => (
            <figure key={w} className="flex flex-col gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- static brand SVG */}
              <img src="/brand/spindle-wordmark-ink.svg" alt={`Spindle wordmark at ${w}px`} width={w} height={Math.round(w * 0.2746)} />
              <figcaption className="font-mono text-code text-text-muted">{w}px</figcaption>
            </figure>
          ))}
          <figure className="flex flex-col gap-2 rounded-card bg-ink p-6">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand SVG */}
            <img src="/brand/spindle-wordmark-white.svg" alt="Spindle wordmark reversed" width={160} height={44} />
            <figcaption className="font-mono text-code text-white">reverse</figcaption>
          </figure>
          <figure className="flex flex-col gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand SVG */}
            <img src="/brand/spindle-wordmark-cobalt.svg" alt="Spindle wordmark cobalt" width={160} height={44} />
            <figcaption className="font-mono text-code text-text-muted">cobalt</figcaption>
          </figure>
          <figure className="flex items-end gap-3">
            {[16, 24, 32, 48].map((s) => (
              // eslint-disable-next-line @next/next/no-img-element -- static brand SVG
              <img key={s} src="/brand/spindle-symbol.svg" alt={`Spindle symbol at ${s}px`} width={s} height={s} />
            ))}
          </figure>
        </div>
      </Section>

      <Section title="Labels">
        <div className="flex flex-wrap items-center gap-3">
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
      </Section>

      <Section title="Course rows">
        <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-surface">
          <li>
            <CourseRow
              item={{ id: "a2", courseId: "c1", versionNumber: 2, available: true, view }}
              earlier={[{ id: "a1", courseId: "c1", versionNumber: 1, available: true, view: { ...view, versionNumber: 1, done: 3, total: 3 } }]}
              base="/design"
            />
          </li>
          <li>
            <CourseRow item={{ id: "a4", courseId: "c2", available: false, versionNumber: 4 }} base="/design" />
          </li>
        </ul>
      </Section>

      <Section title="Notices">
        <VersionNotice delta={view.delta!} versionNumber={2} />
        <IntegrityAlert title="A source cited in this version was retracted after it was published">
          The affected blocks are marked. Read them with that in mind. Your completion and credit stay as they are.
        </IntegrityAlert>
        <VersionUnavailable versionNumber={4} />
        <ErrorNote message="Synthetic form error message." />
      </Section>

      <Section title="Lesson player">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
          <div className="lg:sticky lg:top-6 lg:self-start">
            <LessonOutline view={view} base="/design" currentId="l2" />
          </div>
          <article className="flex max-w-[68ch] flex-col gap-8 text-reading">
            <SupportLegend supports={["science", "practice-based"]} />
            <LessonBlocks blocks={blocks} ctx={{ orgId: null, claims, flagged: new Set([FLAGGED]), integrity: SPECIMEN_INTEGRITY }} />
            <LessonMedia media={[]} orgId={null} />
            <LessonResources
              resources={[
                { label: "Synthetic external reference", href: "https://example.org/synthetic", type: "reference" },
                { label: "Synthetic worksheet", href: "/worksheets/synthetic.pdf", type: "worksheet" },
              ]}
              orgId={null}
            />
          </article>
        </div>
      </Section>

      <Section title="Reviewed diagrams (sample text)">
        <div data-specimen="diagrams" className="mx-auto flex w-full max-w-[68ch] flex-col gap-8">
          {DIAGRAM_SAMPLES.map((content) => (
            <ReviewedDiagram key={content.diagramId} content={content} />
          ))}
          <ReviewedDiagram content={{ diagramId: "synthetic-missing", alt: "Synthetic", caption: "Sample text. A reviewed diagram id with no drawing.", legend: [{ key: "a", label: "Synthetic legend item.", text: "" }] }} />
        </div>
      </Section>

      <Section title="Brand preview">
        <BrandPreview />
      </Section>

      <Section title="Module status and graded quiz">
        <div className="flex max-w-3xl flex-col gap-4">
          <ModuleStatusCard status={null} quizHref={null} />
          <ModuleStatusCard
            status={{ assignmentId: "as1", versionId: "v1", lessonsTotal: 8, lessonsCompleted: 6, quizRequired: true, questionsTotal: 20, bestAttemptId: "a1", bestCorrect: 15, bestTotal: 20, quizPassed: false, quizCreditAttemptId: null, quizCarried: false, complete: false }}
            quizHref="/design"
          />
          <ModuleStatusCard
            status={{ assignmentId: "as1", versionId: "v1", lessonsTotal: 8, lessonsCompleted: 8, quizRequired: true, questionsTotal: 20, bestAttemptId: "a2", bestCorrect: 18, bestTotal: 20, quizPassed: true, quizCreditAttemptId: "a2", quizCarried: false, complete: true }}
            quizHref="/design"
          />
          <QuizBoard />
        </div>
      </Section>

      <Section title="Video (click to load)">
        <p className="text-label text-text-muted">
          Nothing loads from YouTube until Play is pressed. The first clip is YouTube&apos;s own IFrame API demo video (playable); the second is one the
          provider reports as unavailable; the third is switched off in the registry, so nothing from YouTube is offered.
        </p>
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
      </Section>

      <Section title="Motion board (demo states)">
        <CompletionBoard />
        <LogoReveal />
      </Section>
    </LearnShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-border pt-6">
      <h2 className="text-xl font-medium">{title}</h2>
      {children}
    </section>
  );
}

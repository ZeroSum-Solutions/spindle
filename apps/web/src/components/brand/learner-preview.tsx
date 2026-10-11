import type { CSSProperties } from "react";
import type { ClaimIntegrityState, LessonBlock, ModuleStatus } from "@spindle/schema";
import { BASE_ATTRIBUTION, brandToCssVars, type ValidatedBrand } from "@spindle/engine";
import type { ClaimView } from "../../lib/learning/load";
import type { CourseView, LessonView } from "../../lib/learning/view";
import { LessonBlocks } from "../learn/blocks";
import { LayerLabel, SupportLegend } from "../learn/labels";
import { ModuleStatusCard } from "../learn/module-status";
import { LessonOutline } from "../learn/outline";
import { ErrorNote } from "../ui";

// A tenant brand applied to the real learner components: the shell header, the course outline
// with its current lesson, a lesson with science and practice blocks, a self-check, a graded
// question, the module status card, a selected control and an error. Synthetic data only. The
// brand reaches the page only through brandToCssVars on the wrapper, so every themed surface
// below uses the ordinary Atlas utilities (text-brand, bg-brand-soft, the focus ring).

const CLAIM = "00000000-0000-4000-8000-00000000b001";

const claims = new Map<string, ClaimView>([
  [
    CLAIM,
    {
      id: CLAIM,
      statement: "Synthetic claim: this sentence stands in for an approved statement.",
      evidenceLevel: "Synthetic: systematic review",
      population: "Synthetic: adults without shoulder pain",
      sources: [{ id: "sb1", kind: "systematic_review", title: "Synthetic review title", doi: "10.0000/synthetic.brand", pmid: null, url: null, locator: null, license: "Synthetic", retractedAt: null }],
    },
  ],
]);
const integrity = new Map<string, ClaimIntegrityState>([[CLAIM, "current"]]);

const blocks: LessonBlock[] = [
  { kind: "paragraph", content: "A science paragraph. It binds one approved synthetic claim, so it carries the Science label and opens to its sources.", support: "science", claimIds: [CLAIM] },
  { kind: "heading", content: "How to see it" },
  { kind: "paragraph", content: "A practice-based paragraph from the gym's own coaching. It carries no claim and says so.", support: "practice-based", claimIds: [] },
  { kind: "checklist", content: ["Stand behind the client.", "Ask them to raise both arms slowly.", "Note what you see in plain words."], support: "practice-based", claimIds: [] },
  { kind: "callout", content: { label: "Stop and refer", text: "If pain comes on or rises, stop shoulder loading for the session. The full stop rules and referral tiers are in \"When to refer out\"." }, support: "practice-based", claimIds: [] },
  { kind: "heading", content: "Check your understanding" },
  {
    kind: "quiz",
    content: { prompt: "Synthetic self-check: which option is right?", options: ["Option A", "Option B", "Option C"], answerIndex: 1, explanation: "Option B is the synthetic answer." },
    support: "practice-based",
    claimIds: [],
  },
  // A graded question reaches a lesson prompt-only (no options, key or explanation), as in the app.
  { kind: "quiz", content: { prompt: "Synthetic graded question about the claim above." }, support: "science", claimIds: [CLAIM] } as LessonBlock,
];

const lesson = (n: number, title: string, state: LessonView["state"]): LessonView => ({
  id: `l${n}`,
  slug: `lesson-${n}`,
  title,
  partId: "p1",
  partTitle: "Part one",
  durationMinutes: 8,
  format: "article",
  state,
  flagged: false,
});

const view: CourseView = {
  title: "Synthetic shoulder course",
  subtitle: "Preview data only",
  layer: "base",
  versionNumber: 1,
  lessons: [lesson(1, "Synthetic lesson one", "done"), lesson(2, "Synthetic lesson two", "todo"), lesson(3, "Synthetic lesson three", "todo"), lesson(4, "Synthetic lesson four", "todo")],
  done: 1,
  total: 4,
  complete: false,
  next: null,
  flaggedClaimIds: [],
  delta: null,
};

const status = (assignmentId: string): ModuleStatus => ({
  assignmentId,
  versionId: "v1",
  lessonsTotal: 4,
  lessonsCompleted: 1,
  quizRequired: true,
  questionsTotal: 5,
  bestAttemptId: null,
  bestCorrect: null,
  bestTotal: null,
  quizPassed: false,
  quizCreditAttemptId: null,
  quizCarried: false,
  complete: false,
});

export function BrandedLearnerPreview({ brand, font, slug }: { brand: ValidatedBrand; font: { className: string; family: string }; slug: string }) {
  const display: CSSProperties = { fontFamily: font.family };
  const anchor = `#${slug}`;
  return (
    <section
      data-brand-preview={brand.name}
      aria-labelledby={`${slug}-mark`}
      style={brandToCssVars(brand) as CSSProperties}
      data-brand-scope=""
      className={`${font.className} flex min-w-0 flex-col overflow-hidden rounded-card border border-border bg-canvas`}
    >
      <header className="flex min-h-16 items-center justify-between gap-3 border-b border-border bg-surface px-4 md:px-6">
        <span id={`${slug}-mark`} data-brand-mark title={brand.name} style={display} className="min-w-0 truncate text-2xl font-semibold tracking-tight text-brand">
          {brand.name}
        </span>
        <a href={anchor} data-themed="link" className="inline-flex min-h-11 shrink-0 items-center text-label font-medium text-brand underline-offset-4 hover:text-brand-hover hover:underline">
          Your courses
        </a>
      </header>

      {/* The player's frame: a 240px outline and a 736px reading track, centred together (DESIGN.md › Layout). */}
      <div className="mx-auto grid w-full max-w-[1008px] grid-cols-1 gap-8 px-4 py-6 md:px-6 md:py-8 lg:grid-cols-[240px_minmax(0,736px)]">
        <div className="lg:self-start">
          <LessonOutline view={view} base={anchor} currentId="l2" />
        </div>
        <article className="flex min-w-0 flex-col gap-6 text-reading">
          <div className="flex flex-col gap-2">
            <p className="flex flex-wrap items-center gap-2 text-label text-text-muted">
              <LayerLabel layer="base" />
              <span>Lesson 2 of 4</span>
            </p>
            <h2 style={display} className="text-heading-lesson font-semibold text-balance text-text">
              Synthetic lesson two
            </h2>
          </div>
          <SupportLegend supports={["science", "practice-based"]} />
          <LessonBlocks blocks={blocks} ctx={{ orgId: null, claims, flagged: new Set(), integrity, gradedQuiz: true, quizHref: `${anchor}-quiz` }} />
          <ModuleStatusCard status={status(`${slug}-assignment`)} quizHref={`${anchor}-quiz`} titleId={`${slug}-module-status`} />

          <div className="flex flex-col gap-2">
            <p id={`${slug}-view-label`} className="text-label text-text-muted">
              Selected control (preview)
            </p>
            <div role="group" aria-labelledby={`${slug}-view-label`} className="flex flex-wrap gap-2">
              <button type="button" aria-pressed="true" className="min-h-11 rounded-control border border-brand bg-brand px-4 font-medium text-on-brand transition-colors duration-[var(--duration-feedback)] hover:bg-brand-hover">
                Reading view
              </button>
              <button type="button" aria-pressed="false" className="min-h-11 rounded-control border border-control bg-surface px-4 font-medium text-text transition-colors duration-[var(--duration-feedback)] hover:bg-surface-muted">
                Outline view
              </button>
            </div>
          </div>
          <ErrorNote message="Synthetic error: the save failed, so nothing changed." />
        </article>
      </div>

      <footer className="border-t border-border bg-surface px-4 py-3 text-label text-text-muted md:px-6">{BASE_ATTRIBUTION}</footer>
    </section>
  );
}

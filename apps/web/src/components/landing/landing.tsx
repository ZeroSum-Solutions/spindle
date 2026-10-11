import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import { LayerLabel, SupportLabel } from "../learn/labels";
import type { Brand } from "../../lib/brand";
import { LayerStack } from "../illustrations/layer-stack";

// Signed-out landing page. Honest copy only: no testimonials, counts or claims we
// cannot show. Science statements never appear here, because nothing on this page
// is bound to a claim; the lesson specimen describes the labels instead.

const SIGN_IN = "/sign-in?next=%2Fgyms";

// Modalities only. Named methods (conjugate, for example) belong to a coach's method layer, not this list.
const MODALITIES = ["Strength", "Speed", "Hypertrophy", "Mobility", "Yoga", "Pilates", "Sport development"];

const SHOULDER = [
  "Shoulder anatomy a trainer needs",
  "Scapulohumeral rhythm",
  "Mobility and stability",
  "Assessments, screens and red flags",
  "Correctives and activation",
  "Loading the shoulder",
  "Throwing and rotation",
  "When to refer out",
];

const FLOOR = [
  { title: "What it is", text: "The structure or idea, in plain words first and the anatomical term second." },
  { title: "Why it matters", text: "What it changes for the person in front of you." },
  { title: "How to see it", text: "What to look for in a set-up, a rep or a screen." },
  { title: "What to do", text: "A cue, an exercise choice, a progression, or a reason to refer out." },
];

const promises = (name: string) => [
  "Science and practice are labelled passage by passage, in words as well as colour.",
  "Sources are one tap away, by keyboard or touch.",
  "When a cited paper is retracted, the lesson says so and your credit stays.",
  `Safety warnings sit beside each assessment. ${name} never diagnoses.`,
  "No streaks, leaderboards or confetti.",
];

/** Keeps the supplied wordmark's aspect ratio: fixed width, height from the file's own proportions. */
function Wordmark({ src, brand, className = "" }: { src: string; brand: Brand; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a static SVG gains nothing from the optimizer
    <img
      src={src}
      alt=""
      width={brand.wordmark.width}
      height={brand.wordmark.height}
      style={{ width: brand.wordmark.width, height: "auto", aspectRatio: `${brand.wordmark.width} / ${brand.wordmark.height}` }}
      className={className}
    />
  );
}

export function Landing({ brand }: { brand: Brand }) {
  return (
    <>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex min-h-16 w-full max-w-[1200px] items-center justify-between gap-4 px-4 md:px-8">
          <Link href="/" className="-mx-1 inline-flex min-h-11 items-center px-1" aria-label={`${brand.name}, home`}>
            <Wordmark src={brand.wordmark.onLight} brand={brand} className="logo-reveal" />
          </Link>
          <Link
            href={SIGN_IN}
            className="inline-flex min-h-11 items-center rounded-control border border-control bg-surface px-4 font-medium text-text transition-colors duration-[var(--duration-feedback)] hover:bg-surface-muted"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <Hero brand={brand} />
        <Layers />
        <Floor />
        <Honest brand={brand} />
        <Building />
        <Closing brand={brand} />
      </main>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-2 px-4 py-8 text-label text-text-muted md:flex-row md:items-center md:justify-between md:px-8">
          <p>Open source under AGPL-3.0. Original curriculum text under CC BY-SA 4.0.</p>
          <a href="https://github.com/ZeroSum-Solutions/spindle" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-brand hover:text-brand-hover">
            Source code on GitHub
          </a>
        </div>
      </footer>
    </>
  );
}

function Section({ id, labelledBy, className = "", children }: { id?: string; labelledBy: string; className?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={`scroll-mt-4 ${className}`}>
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-10 px-4 py-16 md:px-8 md:py-24">{children}</div>
    </section>
  );
}

/** A section heading led by the Cut 03 tick: the wordmark's 12-degree cut, in place of a template eyebrow. */
function SectionHead({ id, title, children }: { id: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex max-w-[44rem] flex-col gap-3">
      <span aria-hidden className="cut-tick text-ink" />
      <h2 id={id} className="text-heading font-medium text-balance text-text">
        {title}
      </h2>
      {children ? <p className="text-reading text-text-muted">{children}</p> : null}
    </div>
  );
}

function Hero({ brand }: { brand: Brand }) {
  return (
    <section aria-labelledby="hero-title">
      <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 items-center gap-12 px-4 pt-12 pb-16 md:px-8 md:pt-20 md:pb-24 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-16">
        <div className="flex flex-col gap-6">
          <p className="text-label font-medium text-text-muted">For coaches, gyms and the trainers they teach</p>
          <h1 id="hero-title" className="text-display font-medium text-balance text-text">
            Your method, on a base that shows its work.
          </h1>
          <p className="max-w-[52ch] text-reading text-text-muted">
            {brand.name} teaches personal trainers how the body works, and every science statement links to its sources. A gym&apos;s own
            method sits on top as a separate course. Tools for coaches to write and publish those courses are planned.
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link
              href={SIGN_IN}
              className="inline-flex min-h-12 items-center gap-2 rounded-control bg-ink px-5 font-medium text-white transition-colors duration-[var(--duration-feedback)] hover:bg-ink-hover"
            >
              Sign in
              <ArrowRight aria-hidden strokeWidth={1.75} className="size-4" />
            </Link>
            <a href="#layers" className="inline-flex min-h-11 items-center font-medium text-brand hover:text-brand-hover">
              See how the layers fit
            </a>
          </div>
          <p className="text-label text-text-muted">We email you a 6-digit code. New here? The same step creates your account.</p>
        </div>
        <figure className="flex min-w-0 flex-col gap-3" aria-label="Three layers of courses">
          <LayerStack brandName={brand.name} />
          <figcaption className="text-label text-text-muted">Base, modality and method are separate courses. Each keeps its own label. Schematic, not to scale.</figcaption>
        </figure>
      </div>
    </section>
  );
}

/** A lesson as a trainer sees it, described rather than faked: the labels are real components. */
function LessonSpecimen() {
  return (
    <figure className="flex min-w-0 flex-col gap-3" aria-labelledby="specimen-caption">
      <div className="flex flex-col gap-5 rounded-card border border-border bg-surface p-5 md:p-6">
        <div className="flex flex-col gap-2">
          <p className="flex flex-wrap items-center gap-2 text-label text-text-muted">
            <LayerLabel layer="base" />
            <span>Lesson 1 of 8 · Shoulder</span>
          </p>
          <p className="text-xl font-medium tracking-tight text-text">Shoulder anatomy a trainer needs</p>
        </div>
        <div className="flex flex-col gap-2 border-t border-border pt-5">
          <SupportLabel support="science" />
          <p className="text-base text-text">A science statement is bound to a checked claim. Open it to see the claim, the evidence level and the paper.</p>
          <div aria-hidden className="flex min-h-11 items-center justify-between rounded-control border border-border px-3 text-label font-medium text-brand">
            <span>
              Show sources <span className="text-text-muted">(1 claim)</span>
            </span>
            <ChevronDown strokeWidth={1.75} className="size-5" />
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-border pt-5">
          <SupportLabel support="practice-based" />
          <p className="text-base text-text">Cues, set-ups and progressions say they come from coaching practice, so nobody mistakes experience for a citation.</p>
        </div>
      </div>
      <figcaption id="specimen-caption" className="text-label text-text-muted">
        How a lesson labels its teaching text: each passage is science or practice-based.
      </figcaption>
    </figure>
  );
}

function Layers() {
  return (
    <Section id="layers" labelledBy="layers-title" className="border-t border-border bg-surface">
      <SectionHead id="layers-title" title="Your system sits on top. The science underneath is shared and cited.">
        Base, modality and method are separate courses, each labelled with its layer. A gym can assign a trainer courses from every layer, and each
        teaching passage inside a course says whether it is science or practice-based.
      </SectionHead>
      <ol className="flex flex-col gap-4">
        <LayerRow n="03" layer="method" title="Your method" lead="Yours." planned="Authoring planned">
          Your assessments, cues, progressions and language, in your gym&apos;s own course. Always labelled practice-based, so it reads as your
          coaching and never as borrowed science.
        </LayerRow>
        <LayerRow n="02" layer="modality" title="Your discipline" lead="Your field." planned="Planned">
          Science where the evidence exists, practice-based where it is coaching experience. The label tells the trainer which.
          <span className="mt-3 flex flex-wrap gap-2" aria-label="Modalities a course can cover">
            {MODALITIES.map((m) => (
              <span key={m} className="rounded-small border border-border bg-canvas px-2 py-0.5 text-label text-text">
                {m}
              </span>
            ))}
          </span>
        </LayerRow>
        <LayerRow n="01" layer="base" title="How the body works" lead="Shared.">
          Anatomy, movement and loading. Every science statement is bound to a checked claim, with its sources one tap away.
        </LayerRow>
      </ol>
    </Section>
  );
}

function LayerRow({
  n,
  layer,
  title,
  lead,
  planned,
  children,
}: {
  n: string;
  layer: "base" | "modality" | "method";
  title: string;
  lead: string;
  /** Says in words that this layer is not available yet. */
  planned?: string;
  children: ReactNode;
}) {
  return (
    <li className="grid grid-cols-1 gap-3 rounded-card border border-border bg-canvas p-5 md:grid-cols-[4rem_minmax(0,16rem)_minmax(0,1fr)] md:gap-6 md:p-6">
      <span aria-hidden className="font-mono text-code text-text-muted">
        {n}
      </span>
      <div className="flex flex-col items-start gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <LayerLabel layer={layer} />
          {planned ? <span className="text-label text-text-muted">{planned}</span> : null}
        </span>
        <h3 className="text-xl font-medium tracking-tight text-text">{title}</h3>
      </div>
      <p className="flex flex-col text-base text-text-muted">
        <span>
          <span className="font-medium text-text">{lead}</span> {children}
        </span>
      </p>
    </li>
  );
}

function Floor() {
  return (
    <Section labelledBy="floor-title">
      <SectionHead id="floor-title" title="Every idea ends on the gym floor.">
        Short sections, each with one job. A lesson finishes with something you change: an assessment, a cue, an exercise choice or a referral.
      </SectionHead>
      <ol className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {FLOOR.map((item, i) => (
          <li key={item.title} className="flex flex-col gap-2 bg-surface p-5 md:p-6">
            <span aria-hidden className="font-mono text-code text-text-muted">
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="text-lg font-medium text-text">{item.title}</h3>
            <p className="text-base text-text-muted">{item.text}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function Honest({ brand }: { brand: Brand }) {
  return (
    <Section labelledBy="honest-title" className="border-t border-border bg-surface">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
        <div className="flex flex-col gap-8">
          <SectionHead id="honest-title" title="Confident where the research is strong. Clear when it is coaching experience." />
          <LessonSpecimen />
        </div>
        <ul className="flex flex-col divide-y divide-border border-y border-border">
          {promises(brand.name).map((p) => (
            <li key={p} className="flex items-start gap-3 py-4 text-base text-text">
              <Check aria-hidden strokeWidth={1.75} className="mt-1 size-4 shrink-0 text-text" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

function Building() {
  return (
    <Section labelledBy="building-title">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
        <SectionHead id="building-title" title="The first base module is the shoulder.">
          In development: eight lessons, from the anatomy a trainer needs to when to refer out. Each one is checked against its cited research before it is published.
        </SectionHead>
        <ol aria-label="Shoulder module lessons" className="flex flex-col divide-y divide-border rounded-card border border-border bg-surface">
          {SHOULDER.map((title, i) => (
            <li key={title} className="flex items-baseline gap-4 px-4 py-3 md:px-5">
              <span aria-hidden className="w-6 shrink-0 font-mono text-code text-text-muted">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-base text-text">{title}</span>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}

function Closing({ brand }: { brand: Brand }) {
  return (
    <section aria-labelledby="closing-title" className="bg-ink text-white [--focus-ring:var(--color-white)]">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col items-start gap-6 px-4 py-16 md:px-8 md:py-24">
        <Wordmark src={brand.wordmark.onInk} brand={brand} />
        <h2 id="closing-title" className="max-w-[20ch] text-display font-medium text-balance">
          Bring your method.
        </h2>
        <p className="max-w-[52ch] text-reading text-white/80">
          Sign in to join your gym, or start one and invite your trainers. Writing and publishing your own courses is planned for a later release.
        </p>
        <Link
          href={SIGN_IN}
          className="inline-flex min-h-12 items-center gap-2 rounded-control bg-white px-5 font-medium text-ink transition-colors duration-[var(--duration-feedback)] hover:bg-surface-muted"
        >
          Sign in
          <ArrowRight aria-hidden strokeWidth={1.75} className="size-4" />
        </Link>
      </div>
    </section>
  );
}

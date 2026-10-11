import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import { LayerLabel, SupportLabel } from "../learn/labels";
import type { Brand } from "../../lib/brand";
import { LabHero } from "./lab-hero";
import { ThemeToggle } from "../theme/theme-toggle";
import { ThemedWordmark } from "../ui/themed-wordmark";

// Signed-out landing page. Honest copy only: no testimonials, counts or claims we
// cannot show. Science statements never appear here, because nothing on this page
// is bound to a claim; the lesson specimen describes the labels instead.

export const SIGN_IN = "/sign-in?next=%2Fgyms";

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

/** The brand's wordmark in the theme in effect; `surface="ink"` on ink panels, which invert with the theme. */
export function Wordmark({ brand, surface = "page", className = "" }: { brand: Brand; surface?: "page" | "ink"; className?: string }) {
  return <ThemedWordmark brand={brand} surface={surface} className={className} />;
}

/** The signed-out site header: the wordmark home link, the coaches page and sign-in. */
export function SiteHeader({ brand, current }: { brand: Brand; current?: "/coaches" }) {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex min-h-16 w-full max-w-[1200px] items-center justify-between gap-4 px-4 md:px-8">
        <Link href="/" className="-mx-1 inline-flex min-h-11 items-center px-1" aria-label={`${brand.name}, home`}>
          <Wordmark brand={brand} className="logo-reveal" />
        </Link>
        <nav aria-label="Site" className="flex items-center gap-2 sm:gap-4">
          <Link
              href="/coaches"
              aria-current={current === "/coaches" ? "page" : undefined}
              className="hidden min-h-11 items-center px-1 font-medium text-text hover:text-brand aria-[current=page]:underline aria-[current=page]:underline-offset-4 sm:inline-flex"
            >
            For coaches
          </Link>
          <Link
            href={SIGN_IN}
            className="inline-flex min-h-11 items-center rounded-control border border-control bg-surface px-4 font-medium text-text transition-colors duration-[var(--duration-feedback)] hover:bg-surface-muted"
          >
            Sign in
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

/** The signed-out site footer. */
export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-2 px-4 py-8 text-label text-text-muted md:flex-row md:items-center md:justify-between md:px-8">
        <p>Open source under AGPL-3.0. Original curriculum text under CC BY-SA 4.0.</p>
        <span className="flex flex-wrap items-center gap-x-5">
          <Link href="/coaches" className="inline-flex min-h-11 items-center text-brand hover:text-brand-hover">
            For coaches
          </Link>
          <Link href="/privacy" className="inline-flex min-h-11 items-center text-brand hover:text-brand-hover">
            Privacy
          </Link>
          <Link href="/terms" className="inline-flex min-h-11 items-center text-brand hover:text-brand-hover">
            Terms
          </Link>
          <a href="https://github.com/ZeroSum-Solutions/spindle" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-brand hover:text-brand-hover">
            Source code on GitHub
          </a>
        </span>
      </div>
    </footer>
  );
}

export function Landing({ brand }: { brand: Brand }) {
  return (
    <>
      <SiteHeader brand={brand} />

      <main className="flex flex-1 flex-col">
        <LabHero brand={brand} />
        <Layers />
        <Floor />
        <Honest brand={brand} />
        <Building />
        <Closing brand={brand} />
      </main>

      <SiteFooter />
    </>
  );
}

export function Section({ id, labelledBy, className = "", children }: { id?: string; labelledBy: string; className?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={`scroll-mt-4 ${className}`}>
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-10 px-4 py-16 md:px-8 md:py-24">{children}</div>
    </section>
  );
}

/** A section heading led by the Cut 03 tick: the wordmark's 12-degree cut, in place of a template eyebrow. */
export function SectionHead({ id, title, children }: { id: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex max-w-[44rem] flex-col gap-3">
      <span aria-hidden className="cut-tick text-ink" />
      <h2 id={id} className="text-heading text-balance text-text">
        {title}
      </h2>
      {children ? <p className="text-reading text-text-muted">{children}</p> : null}
    </div>
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
      <ol aria-label="The three layers, top to bottom" data-allow-number className="flex flex-col gap-attach md:[&>li:nth-child(2)]:ml-group md:[&>li:nth-child(3)]:ml-page">
        <LayerRow n="3" layer="method" title="Your method" lead="Yours." planned="Authoring planned">
          Your assessments, cues, progressions and language, in your gym&apos;s own course. Always labelled practice-based, so it reads as your
          coaching and never as borrowed science.
        </LayerRow>
        <LayerRow n="2" layer="modality" title="Your discipline" lead="Your field." planned="Planned">
          Science where the evidence exists, practice-based where it is coaching experience. The label tells the trainer which.
          <span className="mt-3 flex flex-wrap gap-2" aria-label="Modalities a course can cover">
            {MODALITIES.map((m) => (
              <span key={m} className="rounded-small border border-border bg-canvas px-2 py-0.5 text-label text-text">
                {m}
              </span>
            ))}
          </span>
        </LayerRow>
        <LayerRow n="1" layer="base" title="How the body works" lead="Shared.">
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
    <li data-layer={layer} className="layer-card relative grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-stack gap-y-tight rounded-card border border-border bg-surface py-block pr-stack shadow-raise md:grid-cols-[5rem_minmax(0,1fr)_auto] md:pr-block">
      <span aria-hidden className="row-span-3 flex flex-col items-center gap-tight border-r border-border md:row-span-2">
        <span className="grid size-6 place-items-center rounded-small border border-control font-mono text-code text-text">{n}</span>
        <span className="font-mono text-eyebrow text-text-muted">L{n}</span>
      </span>
      <div className="flex flex-col items-start gap-tight">
        <h3 className="text-subhead text-text">{title}</h3>
        <span className="flex flex-wrap items-center gap-tight">
          <LayerLabel layer={layer} />
          {planned ? <span className="font-mono text-eyebrow text-text-muted">{planned}</span> : null}
        </span>
      </div>
      <p className="text-ui text-text-muted md:col-start-2">
        <span className="font-semibold text-text">{lead}</span> {children}
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
    <section aria-labelledby="closing-title" className="relative isolate overflow-hidden bg-canvas">
      <div aria-hidden className="closing-art absolute inset-0 -z-10">
        {(["dark", "light"] as const).map((t) => (
          // eslint-disable-next-line @next/next/no-img-element -- decorative art, one file per theme
          <img key={t} src={`/art/chalk-${t}.webp`} alt="" width={1672} height={941} loading="lazy" className={`theme-${t}-only h-full w-full object-cover object-[70%_40%]`} />
        ))}
        <div className="closing-scrim absolute inset-0" />
      </div>
      <div className="mx-auto flex w-full max-w-[1200px] flex-col items-start gap-block px-4 py-section md:px-8 md:py-hero">
        <Wordmark brand={brand} />
        <h2 id="closing-title" className="max-w-[16ch] text-display text-balance text-text">
          Bring your method.
        </h2>
        <p className="max-w-[52ch] text-reading text-text">
          Sign in to join your gym, or start one and invite your trainers. Writing and publishing your own courses is planned for a later release.
        </p>
        <Link
          href={SIGN_IN}
          className="pressable inline-flex min-h-13 items-center gap-tight rounded-control bg-signal px-block text-ui font-semibold text-on-signal hover:bg-signal-hover"
        >
          Sign in
          <ArrowRight aria-hidden strokeWidth={2} className="size-4" />
        </Link>
      </div>
    </section>
  );
}

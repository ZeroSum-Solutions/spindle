import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { LayerLabel, SupportLabel } from "../learn/labels";
import type { Brand } from "../../lib/brand";
import type { BrandFont } from "@spindle/schema";
import { BASE_ATTRIBUTION, brandToCssVars, validateBrand, type ContrastCheck, type ValidatedBrand } from "@spindle/engine";
import { Section, SectionHead, SIGN_IN, SiteFooter, SiteHeader, Wordmark } from "./landing";

// Signed-out page for coaches and gyms. Honest copy only: no statistics, testimonials, coach
// names or logos. Anything not built yet is labelled "Planned" in words, with no dates. Science
// statements never appear here, because nothing on this page is bound to a claim.

const BASE = [
  "Every science statement is bound to a reviewed claim, with its sources one tap away.",
  "Science and practice are labelled passage by passage, in words as well as colour.",
  "When a cited paper is retracted, the lesson says so, and your trainers keep their credit.",
  "Stop rules and referral tiers sit beside every assessment. Nothing diagnoses.",
  "Each completion is recorded against the exact version of the course a trainer took.",
];

// Modalities only, in the order a gym is likely to need them. Named methods belong to a coach's own layer.
export const COACH_MODALITIES = [
  { name: "Strength", scope: "Phases, tiers and percentage work, with exercise demos." },
  { name: "Speed", scope: "Sprint mechanics, with video you can step through." },
  { name: "Hypertrophy", scope: "Volume and progression, with the research cited beside it." },
  { name: "Mobility", scope: "Assessment and range work, with anatomy diagrams." },
  { name: "Yoga", scope: "Series and sequences, labelled practice-based where evidence is thin." },
  { name: "Pilates", scope: "Classes by equipment, from mat to reformer." },
  { name: "Running", scope: "Pace zones, drills and strength work for runners." },
  { name: "Combat sports", scope: "Technique by position, with conditioning." },
  { name: "Team sport", scope: "In-season and off-season phases for a squad." },
  { name: "Youth development", scope: "Stages by age, with tracks for parents and coaches." },
] as const;

/** What coaches need from a teaching platform. None of it is built yet; "today" says what exists now. */
export const CAPABILITIES = [
  {
    title: "Write and publish your method",
    text: "Lessons in your own words, assigned beside the base. Your layer is always labelled practice-based, so it reads as your coaching.",
  },
  { title: "Programs", text: "Phases and weeks you can copy and adjust, each linked to the lessons that explain it." },
  {
    title: "Your own video",
    text: "Upload technique demos and attach them to the lesson they belong to.",
    today: "Today, a lesson can show a YouTube clip that loads only when someone presses Play. A model describes each clip and a second model checks that description; each clip is marked model-described until a person checks it.",
  },
  {
    title: "Certification tracks",
    text: "Courses in order, ending in a graded check, with a record of what each trainer completed.",
    today: "Today, a module has a graded quiz and a completion record per version.",
  },
  {
    title: "Your brand",
    text: "Your name, two colours, your logo and one of three bundled fonts, checked for contrast before they apply.",
  },
] as const;

export interface ThemeSwatch {
  brand: ValidatedBrand;
  checks: ContrastCheck[];
  /** The tenant font's class and family, resolved by the page (next/font). */
  font: { className: string; family: string };
}

/**
 * The example swatches for the page: each brand goes through the real validator, and a brand it
 * refuses is left out rather than shown. `fontFor` resolves the bundled font (next/font in the app).
 */
export function exampleSwatches(brands: readonly unknown[], fontFor: (font: BrandFont) => ThemeSwatch["font"]): ThemeSwatch[] {
  return brands.flatMap((brand) => {
    const result = validateBrand(brand);
    return result.ok ? [{ brand: result.brand, checks: result.checks, font: fontFor(result.brand.font) }] : [];
  });
}

export function Coaches({ brand, swatches }: { brand: Brand; swatches: ThemeSwatch[] }) {
  return (
    <>
      <SiteHeader brand={brand} current="/coaches" />
      <main className="flex flex-1 flex-col">
        <Hero brand={brand} />
        <Base brand={brand} />
        <Method />
        <Modalities />
        <Capabilities brand={brand} />
        <WhiteLabel swatches={swatches} />
        <Closing brand={brand} />
      </main>
      <SiteFooter />
    </>
  );
}

function PlannedTag() {
  // Styled like the layer label (a pale border is structure, not a control), so it never reads as a button.
  return <span className="inline-flex items-center rounded-small border border-border bg-surface px-2 py-0.5 text-label font-medium text-text-muted">Planned</span>;
}

function Hero({ brand }: { brand: Brand }) {
  return (
    <section aria-labelledby="coaches-title">
      <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 items-center gap-12 px-4 pt-12 pb-16 md:px-8 md:pt-20 md:pb-24 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-16">
        <div className="flex flex-col gap-6">
          <span aria-hidden className="cut-tick text-ink" />
          <h1 id="coaches-title" className="text-display text-balance text-text">
            Teach your method on a base that cites its science.
          </h1>
          <p className="max-w-[54ch] text-reading text-text-muted">
            {brand.name} gives your trainers a shared foundation in how the body works, with every science statement linked to its sources. Your
            coaching sits on top, in your words, labelled as practice. Today you can start a gym and invite your trainers. Tools for coaches to write
            and publish their own courses are planned.
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link
              href={SIGN_IN}
              className="inline-flex min-h-12 items-center gap-2 rounded-control bg-ink px-5 font-medium text-on-ink transition-colors duration-[var(--duration-feedback)] hover:bg-ink-hover"
            >
              Sign in
              <ArrowRight aria-hidden strokeWidth={1.75} className="size-4" />
            </Link>
            <a href="#planned" className="inline-flex min-h-11 items-center font-medium text-brand hover:text-brand-hover">
              See what is planned
            </a>
          </div>
        </div>
        <LayeredSpecimen />
      </div>
    </section>
  );
}

/** Your method over the shared base, described with the real labels rather than faked content. */
function LayeredSpecimen() {
  return (
    <figure className="flex min-w-0 flex-col gap-3" aria-labelledby="layered-caption">
      <div className="relative flex flex-col">
        <div className="relative z-10 flex flex-col gap-3 rounded-card border border-ink bg-surface p-5 md:p-6">
          <p className="flex flex-wrap items-center gap-2">
            <LayerLabel layer="method" />
            <SupportLabel support="practice-based" />
          </p>
          <p className="text-lg font-medium tracking-tight text-text">Your course</p>
          <p className="text-base text-text-muted">Your assessments, cues and progressions, in your own language.</p>
        </div>
        <div className="-mt-3 ml-4 flex flex-col gap-3 rounded-card border border-border bg-canvas p-5 pt-7 md:ml-8 md:p-6 md:pt-8">
          <p className="flex flex-wrap items-center gap-2">
            <LayerLabel layer="base" />
            <SupportLabel support="science" />
          </p>
          <p className="text-lg font-medium tracking-tight text-text">The shared base</p>
          <p className="text-base text-text-muted">How the body works. Each science passage opens to its claim and sources.</p>
        </div>
      </div>
      <figcaption id="layered-caption" className="text-label text-text-muted">
        Two separate courses a gym can assign together. Each passage keeps its own label.
      </figcaption>
    </figure>
  );
}

function Base({ brand }: { brand: Brand }) {
  return (
    <Section labelledBy="base-title" className="border-t border-border bg-surface">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
        <SectionHead id="base-title" title="What the evidence base gives your trainers.">
          The base curriculum is written once, checked against its cited research, and shared by every gym on {brand.name}. The first module, the
          shoulder, is in development.
        </SectionHead>
        <ul className="flex flex-col divide-y divide-border border-y border-border">
          {BASE.map((item) => (
            <li key={item} className="flex items-start gap-3 py-4 text-base text-text">
              <Check aria-hidden strokeWidth={1.75} className="mt-1 size-4 shrink-0 text-text" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

function Method() {
  return (
    <Section labelledBy="method-title">
      <SectionHead id="method-title" title="Your method stays yours, and says so.">
        A method course is your gym&apos;s own course, assigned beside the base. Every passage in it is labelled practice-based, so a trainer can
        always tell your coaching from the cited science underneath, and nobody mistakes experience for a citation.
      </SectionHead>
      <ol className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {[
          { label: <SupportLabel support="practice-based" />, title: "Labelled as practice", text: "Cues, set-ups and progressions read as coaching experience, in words as well as colour." },
          { label: <LayerLabel layer="method" />, title: "A separate course", text: "Your course has its own versions, so changing your method never rewrites the base." },
          { label: <SupportLabel support="science" />, title: "Science stays cited", text: "Science passages bind reviewed claims; your method stays practice-based." },
        ].map((item, i) => (
          <li key={item.title} className="flex flex-col gap-3 rounded-card bg-surface-muted p-5 md:p-6">
            <span aria-hidden data-allow-number className="font-mono text-code text-text-muted">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span>{item.label}</span>
            <h3 className="text-lg font-medium text-text">{item.title}</h3>
            <p className="text-base text-text-muted">{item.text}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function Modalities() {
  return (
    <Section labelledBy="modalities-title" className="border-t border-border bg-surface">
      <SectionHead id="modalities-title" title="More disciplines, over time.">
        Modality courses will sit between the base and your method: science where the evidence exists, practice-based where it is coaching
        experience. None of these is built yet.
      </SectionHead>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {COACH_MODALITIES.map((m) => (
          <li key={m.name} data-modality className="flex flex-col gap-3 rounded-card bg-surface-muted p-4">
            <span className="flex items-start justify-between gap-2">
              <h3 className="text-base font-medium text-text">{m.name}</h3>
              <PlannedTag />
            </span>
            <p className="text-label text-text-muted">{m.scope}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Capabilities({ brand }: { brand: Brand }) {
  return (
    <Section id="planned" labelledBy="planned-title">
      <SectionHead id="planned-title" title="What coaches need, and what we plan to build.">
        Coaches who teach their system need to publish it, show it on video, structure it into programs and tracks, and put their own name on it.
        These are planned for {brand.name}, with no dates yet. Where part of it works today, it says so.
      </SectionHead>
      <ol className="flex flex-col divide-y divide-border border-y border-border">
        {CAPABILITIES.map((c, i) => (
          <li key={c.title} data-capability className="grid grid-cols-1 gap-3 py-5 md:grid-cols-[3rem_minmax(0,16rem)_minmax(0,1fr)] md:gap-6 md:py-6">
            <span aria-hidden data-allow-number className="font-mono text-code text-text-muted">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="flex flex-col items-start gap-2">
              <PlannedTag />
              <h3 className="text-lg font-medium tracking-tight text-text">{c.title}</h3>
            </span>
            <span className="flex flex-col gap-2 text-base">
              <span className="text-text-muted">{c.text}</span>
              {"today" in c ? <span className="text-label text-text">{c.today}</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function Swatch({ swatch }: { swatch: ThemeSwatch }) {
  const { brand, checks, font } = swatch;
  const passing = checks.filter((c) => c.pass).length;
  const rows: { label: string; value: string; sample: ReactNode }[] = [
    { label: "Links and focus", value: `${brand.colors.accent} / ${brand.colors.accentDark}`, sample: <span className="size-5 rounded-small bg-brand" /> },
    {
      label: "Text on the accent",
      value: `${brand.colors.onAccent} / ${brand.colors.onAccentDark}`,
      sample: <span className="size-5 rounded-small border border-border bg-on-brand" />,
    },
  ];
  return (
    <figure data-theme-swatch={brand.name} className="flex min-w-0 flex-col gap-3">
      <div style={brandToCssVars(brand) as CSSProperties} data-brand-scope="" className={`${font.className} flex flex-col overflow-hidden rounded-card border border-border bg-canvas`}>
        <div className="flex min-h-14 items-center border-b border-border bg-surface px-4">
          <span style={{ fontFamily: font.family }} className="truncate text-xl font-semibold tracking-tight text-brand">
            {brand.name}
          </span>
        </div>
        <div className="flex flex-col gap-4 p-4">
          <p className="rounded-small bg-brand-soft px-3 py-2 text-label font-medium text-brand">Current lesson</p>
          <p className="flex flex-wrap items-center gap-2">
            <span className="rounded-control bg-brand px-3 py-2 text-label font-medium text-on-brand">Selected</span>
            <SupportLabel support="science" />
            <SupportLabel support="practice-based" />
          </p>
          <dl className="flex flex-col gap-2 text-label">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center gap-2">
                {/* The sample sits inside the term: a <div> in a <dl> may hold only <dt> and <dd>. */}
                <dt className="flex items-center gap-2 text-text-muted">
                  {r.sample}
                  {r.label}
                </dt>
                <dd data-allow-number className="ml-auto font-mono text-code text-text">{r.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="border-t border-border bg-surface px-4 py-2 text-label text-text-muted">{BASE_ATTRIBUTION}</p>
      </div>
      <figcaption data-allow-number className="text-label text-text-muted">
        {passing} of {checks.length} checks pass in light and dark: WCAG 2.2 AA in every state, and distinct from Spindle&apos;s colours.
      </figcaption>
    </figure>
  );
}

function WhiteLabel({ swatches }: { swatches: ThemeSwatch[] }) {
  return (
    <Section labelledBy="brand-title" className="border-t border-border bg-surface">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
        <div className="flex flex-col gap-4">
          <SectionHead id="brand-title" title="Your name on it, with the evidence colours kept honest.">
            A gym brand will change only the mark, links, the current-lesson marker, selected controls, the focus ring and the heading font. Science, practice, caution and danger
            colours never change, and neither does the line that credits the base.
          </SectionHead>
          <p className="flex flex-wrap items-center gap-2 text-label text-text-muted">
            <PlannedTag />
            <span>Shown with two made-up example brands, checked by the validator that will check yours.</span>
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {swatches.map((s) => (
            <Swatch key={s.brand.name} swatch={s} />
          ))}
        </div>
      </div>
    </Section>
  );
}

function Closing({ brand }: { brand: Brand }) {
  return (
    <section aria-labelledby="coaches-closing-title" className="bg-ink text-on-ink [--focus-ring:var(--color-on-ink)]">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col items-start gap-6 px-4 py-16 md:px-8 md:py-24">
        <Wordmark brand={brand} surface="ink" />
        <h2 id="coaches-closing-title" className="max-w-[20ch] text-display text-balance">
          Start with your gym.
        </h2>
        <p className="max-w-[52ch] text-reading text-on-ink/80">
          Sign in to start a gym and invite your trainers, or to join the gym that invited you. We email you a <span data-allow-number>6-digit</span> code; the same step creates
          your account.
        </p>
        <Link
          href={SIGN_IN}
          className="inline-flex min-h-12 items-center gap-2 rounded-control bg-on-ink px-5 font-medium text-ink transition-colors duration-[var(--duration-feedback)] hover:bg-surface-muted"
        >
          Sign in
          <ArrowRight aria-hidden strokeWidth={1.75} className="size-4" />
        </Link>
      </div>
    </section>
  );
}

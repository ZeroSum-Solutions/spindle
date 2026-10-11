import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { SupportLabel } from "../learn/labels";
import type { Brand } from "../../lib/brand";

// The landing hero in Lab (M2b): a cinematic track at night in Lab Dark and the same track in daylight in
// Lab Light (KIE atmosphere art, docs/design/spindle/asset-provenance.json), with the measurement layer
// over it (grid, ruler ticks, a crosshair) and one magenta scan that passes once. The art is decoration:
// alt="", and a scrim in the canvas colour keeps every word at AA or better over it.

const SIGN_IN = "/sign-in?next=%2Fgyms";

/** One theme's art: a wide desktop file and a cropped phone file. CSS shows the theme in effect. */
function Art({ theme }: { theme: "light" | "dark" }) {
  return (
    <picture className={`theme-${theme}-only`}>
      <source media="(max-width: 899px)" srcSet={`/art/track-${theme}-m.webp`} width={900} height={846} />
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative art with art-directed sources */}
      <img src={`/art/track-${theme}.webp`} alt="" width={1672} height={940} fetchPriority="high" className="h-full w-full object-cover object-[70%_50%] lg:object-[50%_0%]" />
    </picture>
  );
}

export function LabHero({ brand }: { brand: Brand }) {
  return (
    <section aria-labelledby="hero-title" data-lab-hero className="relative isolate overflow-hidden bg-canvas">
      <div aria-hidden className="hero-art absolute inset-x-0 top-0 h-[22rem] lg:inset-0 lg:h-auto">
        <Art theme="dark" />
        <Art theme="light" />
        <div className="hero-scrim absolute inset-0" />
      </div>
      <div aria-hidden className="hero-hud pointer-events-none absolute inset-0">
        <div className="hero-grid absolute inset-0" />
        <div className="measure-ticks absolute inset-x-4 top-6 h-4 text-control md:inset-x-8" />
        <span className="hero-xhair absolute top-14 left-4 md:left-8" />
        <span className="hero-scan absolute inset-x-0 top-0 h-px" />
      </div>

      <div className="relative mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-block px-4 pt-[17rem] pb-section md:px-8 lg:min-h-[52rem] lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end lg:gap-group lg:gap-x-page lg:pt-hero">
        <div className="hero-copy flex flex-col gap-block lg:col-span-2 lg:self-start">
          <p className="flex items-center gap-attach text-eyebrow text-text-muted">
            <span aria-hidden className="h-0.5 w-6 bg-signal" />
            For coaches, gyms and the trainers they teach
          </p>
          <h1 id="hero-title" className="max-w-[15ch] text-display text-text">
            Your method, on a base that shows its work.
          </h1>
        </div>
        <div className="flex flex-col gap-block">
          <p className="max-w-[34em] text-ui text-text md:text-reading">
            {brand.name} teaches personal trainers how the body works, and every science statement links to its sources. A gym&apos;s own method
            sits on top as a separate course. Tools for coaches to write and publish those courses are planned.
          </p>
          <div className="flex flex-wrap items-center gap-x-block gap-y-attach">
            <Link
              href={SIGN_IN}
              className="pressable inline-flex min-h-13 items-center gap-tight rounded-control bg-signal px-block text-ui font-semibold text-on-signal hover:bg-signal-hover"
            >
              Sign in
              <ArrowRight aria-hidden strokeWidth={2} className="size-4" />
            </Link>
            <a href="#layers" className="inline-flex min-h-11 items-center font-medium text-text underline decoration-control decoration-1 underline-offset-[6px] hover:decoration-signal">
              See how the layers fit
            </a>
          </div>
          <p className="max-w-[30em] text-label text-text-muted">
            We email you a <span data-allow-number>6-digit</span> code. New here? The same step creates your account.
          </p>
        </div>
        <Readout />
      </div>
    </section>
  );
}

/** A lesson block as a readout card: the Science label, a rail, and the sources tray. Describes, never fakes a claim. */
function Readout() {
  return (
    <figure aria-labelledby="hero-readout-caption" data-allow-number className="hidden flex-col overflow-hidden rounded-plate border border-border bg-surface/90 shadow-float backdrop-blur lg:flex">
      <figcaption id="hero-readout-caption" className="flex items-center justify-between border-b border-border px-stack py-attach text-eyebrow text-text-muted">
        <span>Lesson block</span>
        <span>Base · Shoulder</span>
      </figcaption>
      <div className="relative m-stack mb-0 flex flex-col gap-attach rounded-small bg-science-soft py-stack pr-stack pl-block before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:rounded-[2px] before:bg-science">
        <SupportLabel support="science" />
        <p className="text-ui text-text">A science statement is bound to a checked claim, with the evidence level and the paper one tap away.</p>
      </div>
      <div aria-hidden className="mx-stack mb-stack flex min-h-11 items-center justify-between rounded-b-small border-t border-dashed border-science/40 px-stack text-code text-text-muted">
        <span>
          <b className="font-semibold text-text">[1]</b> Sources · 1 claim
        </span>
        <ChevronDown strokeWidth={1.75} className="size-4" />
      </div>
    </figure>
  );
}

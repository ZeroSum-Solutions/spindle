import type { CSSProperties } from "react";
import { ArrowRight } from "lucide-react";
import { ModalityChip } from "./modality-chip";
import { displayName, type CatalogHeroView, type MemberBrandView, type NavLink } from "./view";

/**
 * The member catalog hero (DESIGN.md › Layout): text only, on the band, directly under the header.
 * Until the headline is admitted, the brand name (or "Your gym") stands in; a pending tagline is
 * omitted. The one ink action sits on canvas below the band, never on it.
 */
export function CatalogHero({
  brand,
  hero,
  fontFamily,
  action,
  headingLevel = 1,
}: {
  brand: MemberBrandView;
  hero: CatalogHeroView;
  fontFamily: string;
  /** The one ink action; absent when there is nothing to start (no assigned course). */
  action?: NavLink;
  headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return (
    <div className="@container">
      <div data-surface="band" className="bg-band text-on-band" style={{ "--focus-ring": "var(--color-on-band)" } as CSSProperties}>
        <div className="mx-auto w-full max-w-[1200px] px-4 pb-10 pt-8 @[720px]:pb-16 @[720px]:pt-12 md:px-8">
          <div className="flex max-w-[36rem] flex-col gap-4">
            <Heading
              data-hero-headline
              className="text-[2.5rem] font-semibold leading-[1.02] tracking-[-0.02em] @[720px]:text-[4rem] @[720px]:leading-[0.98]"
              style={{ fontFamily, overflowWrap: "anywhere" }}
            >
              {hero.headline ?? displayName(brand)}
            </Heading>
            {hero.tagline ? (
              <p data-hero-tagline className="max-w-[40ch] text-reading" style={{ overflowWrap: "anywhere" }}>
                {hero.tagline}
              </p>
            ) : null}
            {hero.modalities.length > 0 ? (
              <ul aria-label="Modalities" className="flex flex-wrap gap-2 pt-1">
                {hero.modalities.slice(0, 3).map((tag) => (
                  <li key={tag}>
                    <ModalityChip tag={tag} on="band" />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>
      {action ? (
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-8">
        <a
          data-catalog-action
          href={action.href}
          className="inline-flex min-h-12 items-center gap-2 rounded-control bg-ink px-5 font-medium text-white transition-colors duration-[var(--duration-feedback)] hover:bg-ink-hover"
        >
          {action.label}
          <ArrowRight aria-hidden strokeWidth={1.75} className="size-4" />
        </a>
      </div>
      ) : null}
    </div>
  );
}

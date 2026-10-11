import type { Metadata } from "next";
import { validateBrand } from "@spindle/engine";
import { BrandedLearnerPreview } from "@/components/brand/learner-preview";
import { tenantFontClass } from "@/lib/theme/fonts";
import { LIGHT_SAGE, OXBLOOD, SAGE } from "@/lib/theme/preview-brands";

// Test-only page (P4-A): two synthetic brands on the real learner components, for Playwright and
// axe. No database, no sign-in, no tenant data. The proxy answers 404 unless previewPagesEnabled.

export const metadata: Metadata = { title: "Brand preview (test only)", robots: { index: false } };

const PREVIEWS = [
  { brand: OXBLOOD, slug: "oxblood" },
  { brand: SAGE, slug: "sage" },
] as const;

export default function BrandPreviewPage() {
  const refused = validateBrand(LIGHT_SAGE);
  return (
    <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-4 py-8 md:px-8">
      <div className="flex max-w-[68ch] flex-col gap-2">
        <span aria-hidden className="cut-tick text-ink" />
        <h1 className="text-heading font-medium text-text">Brand preview</h1>
        <p className="text-reading text-text-muted">
          Two made-up brands on the real learner components. A brand changes the mark, links, the current lesson, selected controls, the focus ring
          and the heading font. Evidence labels, errors and the base attribution stay Spindle&apos;s. Test data only.
        </p>
      </div>
      {PREVIEWS.map(({ brand, slug }) => {
        const result = validateBrand(brand);
        if (!result.ok) throw new Error(`preview brand ${brand.name} must pass: ${result.problems.join("; ")}`);
        return <BrandedLearnerPreview key={slug} slug={slug} brand={result.brand} font={tenantFontClass(result.brand.font)} />;
      })}
      {!refused.ok ? (
        <section aria-labelledby="refused-title" data-brand-refused className="flex flex-col gap-2 rounded-card bg-surface-muted p-4 md:p-6">
          <h2 id="refused-title" className="text-lg font-medium text-text">
            Refused: {LIGHT_SAGE.name}, accent {LIGHT_SAGE.colors.accent}
          </h2>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-label text-text-muted">
            {refused.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}

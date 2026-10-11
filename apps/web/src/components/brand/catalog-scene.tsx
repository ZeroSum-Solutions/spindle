import type { CSSProperties } from "react";
import { tenantFontClass } from "@/lib/theme/fonts";
import type { CatalogScene } from "@/lib/theme/preview-catalog";
import { BrandHeader } from "./brand-header";
import { CatalogHero } from "./catalog-hero";
import { CoachNote } from "./coach-note";
import { CourseSection } from "./course-section";
import { brandScopeVars } from "./view";

/**
 * A member catalog as a branded gym's member would see it, composed from the P4-A2 components for
 * the test-only preview: header band, hero, the gym's method courses, then Spindle's base and
 * modality courses under the seal, and a coach note as it opens a method course.
 */
export function CatalogPreviewScene({ scene }: { scene: CatalogScene }) {
  const font = tenantFontClass(scene.brand.font);
  const headingId = `catalog-${scene.id}`;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-lg font-medium text-text">
          Member catalog: {scene.id}
        </h2>
        <p className="text-label text-text-muted">{scene.caption}</p>
      </div>
      <div
        data-catalog-preview={scene.id}
        className={`${font.className} overflow-hidden rounded-card border border-border bg-canvas`}
        style={brandScopeVars(scene.brand.colors) as CSSProperties}
      >
        <BrandHeader brand={scene.brand} fontFamily={font.family} links={scene.links} />
        <CatalogHero brand={scene.brand} hero={scene.hero} fontFamily={font.family} action={scene.action} headingLevel={2} />
        <div className="@container mx-auto flex w-full max-w-[1200px] flex-col gap-10 px-4 pb-10 md:px-8">
          <CourseSection id={`${headingId}-gym`} kind="method" title="From your gym" courses={scene.methodCourses} colors={scene.brand.colors} fontFamily={font.family} />
          <CourseSection id={`${headingId}-base`} kind="base" title="Base curriculum" courses={scene.baseCourses} colors={scene.brand.colors} fontFamily={font.family} seal />
          <CourseSection id={`${headingId}-modality`} kind="modality" title="Modality courses" courses={scene.modalityCourses} colors={scene.brand.colors} fontFamily={font.family} />
          {scene.note ? (
            <section aria-labelledby={`${headingId}-note`} className="flex flex-col gap-4">
              <h3 id={`${headingId}-note`} className="text-label font-medium uppercase tracking-[0.08em] text-text-muted">
                Opening a gym course
              </h3>
              <CoachNote note={scene.note} />
            </section>
          ) : null}
        </div>
      </div>
    </section>
  );
}


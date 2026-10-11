import Link from "next/link";
import { Suspense, type CSSProperties } from "react";
import { ArrowRight } from "lucide-react";
import { CourseRow } from "@/components/learn/course-row";
import { LearnShell, LoadingNote } from "@/components/learn/shell";
import { learnerGym, myAssignments, type AssignmentSummary } from "@/lib/learning/load";
import { byCourse } from "@/lib/learning/view";
import { loadModuleStatus } from "@/lib/learning/quiz-server";
import { memberBrand } from "@/lib/learning/tenant";
import { brandFromDto, catalogAction, catalogCards } from "@/components/brand/adapt";
import { BrandHeader } from "@/components/brand/brand-header";
import { CatalogHero } from "@/components/brand/catalog-hero";
import { CourseSection } from "@/components/brand/course-section";
import { brandScopeVars, type CourseCardView } from "@/components/brand/view";
import { tenantFontClass } from "@/lib/theme/fonts";

export default function LearnPage(props: PageProps<"/gyms/[slug]/learn">) {
  return (
    <Suspense
      fallback={
        <LearnShell>
          <LoadingNote>Loading your courses…</LoadingNote>
        </LearnShell>
      }
    >
      <Courses {...props} />
    </Suspense>
  );
}

async function Courses({ params }: PageProps<"/gyms/[slug]/learn">) {
  const { slug } = await params;
  const ctx = await learnerGym(slug);
  const [items, brandDto] = await Promise.all([myAssignments(ctx), memberBrand(ctx)]);
  const base = `/gyms/${ctx.org.slug}/learn`;
  const courses = byCourse(items);
  // Completion labels come from the server's module status, never from lesson counts alone.
  const statuses = new Map(
    await Promise.all(courses.map(async (c) => [c.latest.id, c.latest.available ? ((await loadModuleStatus(ctx, c.latest.id))?.complete ?? null) : null] as const)),
  );
  // Resume only ever points into the newest assigned version of a course.
  const resume = courses
    .map((c) => c.latest)
    .find((a): a is Extract<AssignmentSummary, { available: true }> => a.available && a.view.next !== null);

  // P4-A2: a gym with a saved, valid brand gets the branded catalog; otherwise the standard list.
  const branded = brandFromDto(brandDto);
  if (branded) {
    // Cards describe the version they open: each course's newest assigned version (Sol R1 on #45).
    return <BrandedCatalog branded={branded} entries={catalogCards(courses, base)} base={base} action={catalogAction(courses, base)} />;
  }

  return (
    <LearnShell gym={ctx.org.name} back={{ href: `/gyms/${ctx.org.slug}`, label: ctx.org.name }}>
      <div data-layout="column" className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <h1 className="text-heading font-medium">Your courses</h1>
      {items.length === 0 ? (
        <p className="rounded-card border border-border bg-surface p-6 text-text-muted">Nothing is assigned to you in this gym yet.</p>
      ) : (
        <>
          {resume ? (
            <section aria-labelledby="resume-title" className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5 md:p-6">
              <p className="text-label text-text-muted">Next up in {resume.view.title}</p>
              <h2 id="resume-title" className="text-xl font-medium">
                {resume.view.next!.title}
              </h2>
              <Link
                href={`${base}/${resume.id}/${resume.view.next!.slug}`}
                className="inline-flex min-h-12 items-center gap-2 self-start rounded-control bg-ink px-5 font-medium text-white hover:bg-ink-hover"
              >
                Resume lesson
                <ArrowRight aria-hidden strokeWidth={1.75} className="size-4" />
              </Link>
            </section>
          ) : null}
          <ul aria-label="Assigned courses" className="flex flex-col divide-y divide-border rounded-card border border-border bg-surface">
            {courses.map((course) => (
              <li key={course.latest.id}>
                <CourseRow item={course.latest} base={base} earlier={course.earlier} moduleComplete={statuses.get(course.latest.id) ?? null} />
              </li>
            ))}
          </ul>
        </>
      )}
      </div>
    </LearnShell>
  );
}

/**
 * The member catalog of a branded gym: the tenant header band, the hero, then the assigned courses
 * as cards, grouped as Gym method, Base (under the seal) and Modality. Only courses the member is
 * assigned appear; each card opens the newest assigned version.
 */
function BrandedCatalog({
  branded,
  entries,
  base,
  action,
}: {
  branded: NonNullable<ReturnType<typeof brandFromDto>>;
  entries: ReturnType<typeof catalogCards>;
  base: string;
  action: { label: string; href: string } | undefined;
}) {
  const { brand, hero } = branded;
  const font = tenantFontClass(brand.font);
  const of = (layer: CourseCardView["layer"]) => entries.filter((e) => e.card.layer === layer).map((e) => e.card);
  const earlier = new Map(entries.map((e) => [e.card.id, e.earlier]));
  return (
    <div className={`${font.className} flex flex-1 flex-col bg-canvas`} style={brandScopeVars(brand.colors) as CSSProperties}>
      <BrandHeader
        brand={brand}
        fontFamily={font.family}
        links={[
          { label: "Your courses", href: base },
          { label: "Your gyms", href: "/gyms" },
        ]}
      />
      <main className="flex flex-1 flex-col">
        <CatalogHero brand={brand} hero={hero} fontFamily={font.family} action={action} headingLevel={1} />
        <div className="@container mx-auto flex w-full max-w-[1200px] flex-col gap-10 px-4 pb-12 md:px-8">
          {entries.length === 0 ? (
            <p className="mt-6 rounded-card border border-border bg-surface p-6 text-text-muted">Nothing is assigned to you in this gym yet.</p>
          ) : null}
          <CourseSection id="catalog-gym" kind="method" title="From your gym" courses={of("method")} colors={brand.colors} fontFamily={font.family} level={2} earlier={earlier} />
          <CourseSection id="catalog-base" kind="base" title="Base curriculum" courses={of("base")} colors={brand.colors} fontFamily={font.family} level={2} seal earlier={earlier} />
          <CourseSection id="catalog-modality" kind="modality" title="Modality courses" courses={of("modality")} colors={brand.colors} fontFamily={font.family} level={2} earlier={earlier} />
        </div>
      </main>
    </div>
  );
}

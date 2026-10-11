import { BaseSeal } from "./base-seal";
import { CourseCard } from "./course-card";
import type { BrandColors, CourseCardView } from "./view";

/**
 * One catalog section: a heading, the seal for Base only, and a card grid whose titles sit one level
 * below the section heading (h2 and h3 on the member page; h3 and h4 inside the preview scenes).
 */
export function CourseSection({
  id,
  kind,
  title,
  courses,
  colors,
  fontFamily,
  seal = false,
  level = 3,
  earlier,
}: {
  id: string;
  kind: "method" | "base" | "modality";
  title: string;
  courses: CourseCardView[];
  colors: BrandColors;
  fontFamily: string;
  seal?: boolean;
  level?: 2 | 3;
  /** Earlier assigned versions of a card's course, by card id: plain links beside the card, never inside it. */
  earlier?: ReadonlyMap<string, readonly { href: string; label: string }[]>;
}) {
  if (courses.length === 0) return null;
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <section aria-labelledby={id} data-catalog-section={kind} className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <Heading id={id} className="text-label font-medium uppercase tracking-[0.08em] text-text-muted">
          {title}
        </Heading>
        {seal ? <BaseSeal strip /> : null}
      </div>
      <ul className="grid gap-5 @[640px]:grid-cols-2 @[1024px]:grid-cols-3">
        {courses.map((c) => (
          <li key={c.id} className="flex flex-col gap-2">
            <CourseCard course={c} colors={colors} fontFamily={fontFamily} headingLevel={level === 2 ? 3 : 4} />
            {earlier?.get(c.id)?.length ? (
              <p className="flex flex-wrap items-center gap-x-3 text-label text-text-muted">
                <span>Earlier:</span>
                {earlier.get(c.id)!.map((e) => (
                  <a key={e.href} href={e.href} className="inline-flex min-h-11 items-center text-brand underline-offset-4 hover:text-brand-hover hover:underline">
                    {e.label}
                  </a>
                ))}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

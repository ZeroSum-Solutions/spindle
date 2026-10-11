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
}: {
  id: string;
  kind: "method" | "base" | "modality";
  title: string;
  courses: CourseCardView[];
  colors: BrandColors;
  fontFamily: string;
  seal?: boolean;
  level?: 2 | 3;
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
          <li key={c.id}>
            <CourseCard course={c} colors={colors} fontFamily={fontFamily} headingLevel={level === 2 ? 3 : 4} />
          </li>
        ))}
      </ul>
    </section>
  );
}

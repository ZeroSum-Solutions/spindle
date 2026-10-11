import { useId } from "react";
import { LayerLabel } from "../learn/labels";
import { BaseSeal } from "./base-seal";
import { CourseCover } from "./course-cover";
import { ModalityChip } from "./modality-chip";
import { courseTitle, NEUTRAL_COVER, type BrandColors, type CourseCardView } from "./view";

/**
 * One course in the member catalog. The whole card is one link, named by its title; its focus ring
 * (the accent, 3px, offset 4px) lies outside the card edge on canvas. Gym method courses draw their
 * own pattern; Base and Modality courses always draw Spindle's neutral cover. Base cards carry the
 * seal; Modality cards say "Published by Spindle". Support labels stay on blocks, never here.
 */
export function CourseCard({ course, fontFamily }: { course: CourseCardView; colors: BrandColors; fontFamily: string; headingLevel?: 3 | 4 }) {
  const id = useId();
  const cover = course.layer === "method" && course.cover ? course.cover : NEUTRAL_COVER;
  return (
    <a
      data-course-card
      data-layer={course.layer}
      href={course.href}
      aria-labelledby={`${id}-title`}
      aria-describedby={course.blurb ? `${id}-blurb` : undefined}
      className="flex h-full flex-col overflow-hidden rounded-card border border-border bg-surface text-text transition-colors duration-[var(--duration-feedback)] hover:border-control"
    >
      <CourseCover cover={cover} />
      <div className="flex flex-1 flex-col gap-3 px-5 pb-5 pt-4">
        <h3 id={`${id}-title`} data-course-title className="text-[20px] font-semibold leading-[1.2] tracking-[-0.01em]" style={{ fontFamily, overflowWrap: "anywhere" }}>
          {courseTitle(course)}
        </h3>
        {course.blurb ? (
          <p id={`${id}-blurb`} className="text-[16px] leading-[1.5] text-text-muted" style={{ overflowWrap: "anywhere" }}>
            {course.blurb}
          </p>
        ) : null}
        {course.tags.length > 0 ? (
          <ul aria-label="Modalities" className="flex flex-wrap gap-1.5">
            {course.tags.slice(0, 2).map((tag) => (
              <li key={tag}>
                <ModalityChip tag={tag} on="surface" />
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-auto pt-1 text-label text-text-muted">{course.meta}</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border px-5 py-3">
        <LayerLabel layer={course.layer} />
        {course.layer === "base" ? <BaseSeal /> : course.layer === "modality" ? <span className="text-label text-text-muted">Published by Spindle</span> : null}
      </div>
    </a>
  );
}

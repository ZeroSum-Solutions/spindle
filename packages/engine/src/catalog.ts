// Pure catalog functions. Ported from the trainer-academy prototype and changed
// to take the catalog as an argument instead of importing compiled content.
import { isVideoHostUrl, type Catalog, type Course, type Lesson } from "@spindle/schema";

export interface LessonLocation {
  course: Course;
  partIndex: number;
  lessonIndex: number;
  lesson: Lesson;
}

export interface ProvenanceLookup {
  has(id: string): boolean;
}

/** Answers whether a claim record exists, is approved, unexpired and not retracted. */
export interface ClaimLookup {
  isPublishable(id: string): boolean;
}

export function validateCatalog(catalog: Catalog, provenance: ProvenanceLookup, claims: ClaimLookup): void {
  const ids = new Set<string>();
  const slugs = new Set<string>();
  for (const course of catalog.courses) {
    const lessonSlugs = new Set<string>();
    claimUnique(ids, course.id);
    invariant(!slugs.has(course.slug), `Duplicate course slug ${course.slug}`);
    slugs.add(course.slug);
    course.parts.forEach((part, partIndex) => {
      invariant(part.ordinal === partIndex + 1, `${part.id} has invalid ordinal`);
      claimUnique(ids, part.id);
      for (const lesson of part.lessons) {
        claimUnique(ids, lesson.id);
        invariant(!lessonSlugs.has(lesson.slug), `Duplicate lesson slug ${course.slug}/${lesson.slug}`);
        lessonSlugs.add(lesson.slug);
        for (const block of lesson.blocks) {
          if (block.kind === "image") {
            requireProvenance(provenance, block.content.provenanceId);
            requireNoVideoHost(lesson.id, block.content.src);
          }
          if (block.kind === "video") {
            invariant(course.layer !== "method", `${lesson.id} is gym method content and cannot embed registry videos`);
            invariant(block.content.endSeconds > block.content.startSeconds, `${lesson.id} has a video segment that ends before it starts`);
          }
          if (block.kind === "quiz") {
            const { options, answerIndex } = block.content;
            invariant(options.length >= 2, `${lesson.id} has a quiz with fewer than two options`);
            invariant(
              Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex < options.length,
              `${lesson.id} has a quiz answer outside its options`,
            );
          }
          if (!("support" in block)) continue;
          if (block.support === "science") {
            invariant(course.layer !== "method", `${lesson.id} is gym method content and cannot claim science`);
            invariant(block.claimIds.length > 0, `${lesson.id} has a science block without a claim`);
            for (const id of block.claimIds) {
              invariant(claims.isPublishable(id), `${lesson.id} cites claim ${id}, which is not approved`);
            }
          } else {
            invariant(block.claimIds.length === 0, `${lesson.id} has a practice-based block posing as science`);
          }
        }
        for (const media of lesson.media) {
          requireProvenance(provenance, media.provenanceId);
          requireNoVideoHost(lesson.id, media.src);
        }
      }
    });
  }
}

function claimUnique(ids: Set<string>, id: string): void {
  invariant(!ids.has(id), `Duplicate id ${id}`);
  ids.add(id);
}

/** New content embeds video only through registry video blocks (ADR 0007). */
function requireNoVideoHost(lessonId: string, src: string): void {
  invariant(!isVideoHostUrl(src), `${lessonId} has media on a video host; use a registry video block`);
}

function requireProvenance(provenance: ProvenanceLookup, id: string): void {
  invariant(provenance.has(id), `Missing provenance ${id}`);
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid catalog: ${message}`);
}

export function flattenLessons(courses: Course[]): LessonLocation[] {
  return courses.flatMap((course) =>
    course.parts.flatMap((part, partIndex) =>
      part.lessons.map((lesson, lessonIndex) => ({ course, partIndex, lessonIndex, lesson })),
    ),
  );
}

export function findLesson(catalog: Catalog, courseSlug: string, lessonSlug: string): LessonLocation | undefined {
  const course = catalog.courses.find((c) => c.slug === courseSlug);
  return course ? flattenLessons([course]).find((loc) => loc.lesson.slug === lessonSlug) : undefined;
}

export function nextLesson(course: Course, lessonId: string): Lesson | null {
  const lessons = flattenLessons([course]).map((loc) => loc.lesson);
  const index = lessons.findIndex((lesson) => lesson.id === lessonId);
  return index >= 0 ? (lessons[index + 1] ?? null) : null;
}

export function courseDuration(course: Course): number {
  return flattenLessons([course]).reduce((sum, loc) => sum + loc.lesson.durationMinutes, 0);
}

export function coursePercent(course: Course, completedIds: readonly string[]): number {
  const lessons = flattenLessons([course]);
  if (lessons.length === 0) return 0;
  const done = new Set(completedIds);
  return Math.round((lessons.filter((loc) => done.has(loc.lesson.id)).length / lessons.length) * 100);
}

export function searchCatalog(catalog: Catalog, query: string): { courses: Course[]; lessons: LessonLocation[] } {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return { courses: [], lessons: [] };
  const matches = (values: string[]) => {
    const text = values.join(" ").toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  };
  return {
    courses: catalog.courses.filter((c) => matches([c.title, c.subtitle, c.description, c.level, ...c.outcomes])),
    lessons: flattenLessons(catalog.courses).filter(({ course, lesson }) =>
      matches([course.title, lesson.title, lesson.summary, ...lesson.objectives]),
    ),
  };
}

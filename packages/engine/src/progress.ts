// Pure progress functions, ported from the trainer-academy prototype.
// Persistence moves to the database in phase 2; these stay pure.
import type { Catalog } from "@spindle/schema";
import { flattenLessons } from "./catalog";

export interface LearnerProgress {
  version: 1;
  completedLessonIds: string[];
  lastLessonId: string | null;
}

export const emptyProgress: LearnerProgress = { version: 1, completedLessonIds: [], lastLessonId: null };

export function normalizeProgress(value: unknown): LearnerProgress {
  if (!value || typeof value !== "object" || (value as { version?: unknown }).version !== 1) {
    return { ...emptyProgress, completedLessonIds: [] };
  }
  const data = value as Partial<LearnerProgress>;
  return {
    version: 1,
    completedLessonIds: uniqueStrings(data.completedLessonIds),
    lastLessonId: typeof data.lastLessonId === "string" ? data.lastLessonId : null,
  };
}

function uniqueStrings(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string"))] : [];
}

/** Completing a lesson twice must not double-count it. */
export function completeLesson(progress: LearnerProgress, lessonId: string): LearnerProgress {
  const completed = progress.completedLessonIds.includes(lessonId)
    ? progress.completedLessonIds
    : [...progress.completedLessonIds, lessonId];
  return { ...progress, completedLessonIds: completed, lastLessonId: lessonId };
}

export function overallPercent(catalog: Catalog, progress: LearnerProgress): number {
  const lessonIds = new Set(flattenLessons(catalog.courses).map((loc) => loc.lesson.id));
  if (lessonIds.size === 0) return 0;
  const completed = new Set(progress.completedLessonIds.filter((id) => lessonIds.has(id))).size;
  return Math.min(100, Math.round((completed / lessonIds.size) * 100));
}

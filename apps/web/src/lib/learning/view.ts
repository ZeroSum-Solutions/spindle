// Pure learner view model. The database rows are the truth for credit; the
// engine only names the version delta. Nothing here reads the network.
import { diffVersions, type VersionDelta } from "@spindle/engine";
import {
  parseCourse,
  parseLessonCompletions,
  parseVersionManifest,
  type Course,
  type CurriculumLayer,
  type Lesson,
  type LessonCompletion,
  type VersionManifest,
} from "@spindle/schema";

/** A published version as the learner sees it, after ingress checks. */
export interface PublishedVersion {
  id: string;
  versionNumber: number;
  layer: CurriculumLayer;
  /** Null for global (base/modality) content; the gym id for method content. */
  orgId: string | null;
  course: Course;
  manifest: VersionManifest;
}

export interface VersionRow {
  id: string;
  version_number: number;
  layer: string;
  org_id: string | null;
  snapshot: unknown;
}

export interface ManifestRow {
  lesson_id: string;
  ordinal: number;
  content_hash: string;
}

export interface CompletionRow {
  id: string;
  version_id: string;
  lesson_id: string;
  content_hash: string;
  completed_at: string;
  origin_completion_id: string | null;
}

/** Thrown when stored content does not pass ingress. The page shows an honest "cannot display" state. */
export class VersionUnavailableError extends Error {
  constructor(readonly versionId: string, reason: string) {
    super(`Version ${versionId} cannot be displayed: ${reason}`);
    this.name = "VersionUnavailableError";
  }
}

const LAYERS: readonly CurriculumLayer[] = ["base", "modality", "method"];

/**
 * Checks a stored version at ingress: the snapshot must parse, its layer must match
 * the row, and its lessons must be exactly the manifest's lessons. Nothing renders
 * partially.
 */
export function publishedVersion(row: VersionRow, manifestRows: readonly ManifestRow[]): PublishedVersion {
  let course: Course;
  let manifest: VersionManifest;
  try {
    course = parseCourse(row.snapshot);
    const ordered = [...manifestRows].sort((a, b) => a.ordinal - b.ordinal);
    manifest = parseVersionManifest({
      versionId: row.id,
      lessons: ordered.map((r) => ({ lessonId: r.lesson_id, contentHash: r.content_hash })),
    });
  } catch {
    throw new VersionUnavailableError(row.id, "content failed ingress checks");
  }
  if (!LAYERS.includes(row.layer as CurriculumLayer) || course.layer !== row.layer) {
    throw new VersionUnavailableError(row.id, "layer does not match");
  }
  if ((row.layer === "method") !== (row.org_id !== null)) {
    throw new VersionUnavailableError(row.id, "layer does not match its owner");
  }
  const courseIds = lessonsOf(course).map((l) => l.id);
  const manifestIds = manifest.lessons.map((l) => l.lessonId);
  if (courseIds.length !== manifestIds.length || new Set(courseIds).size !== courseIds.length) {
    throw new VersionUnavailableError(row.id, "lessons do not match the manifest");
  }
  const inManifest = new Set(manifestIds);
  if (!courseIds.every((id) => inManifest.has(id))) {
    throw new VersionUnavailableError(row.id, "lessons do not match the manifest");
  }
  return { id: row.id, versionNumber: row.version_number, layer: row.layer as CurriculumLayer, orgId: row.org_id, course, manifest };
}

export function completionsFrom(rows: readonly CompletionRow[]): LessonCompletion[] {
  return parseLessonCompletions(
    rows.map((r) => ({
      id: r.id,
      lessonId: r.lesson_id,
      versionId: r.version_id,
      contentHash: r.content_hash,
      completedAt: r.completed_at,
      originCompletionId: r.origin_completion_id,
    })),
  );
}

export function lessonsOf(course: Course): Lesson[] {
  return course.parts.flatMap((part) => part.lessons);
}

export type LessonState = "done" | "credited" | "updated" | "new" | "todo";

export interface LessonOrigin {
  completedAt: string;
  /** Null when the original version is not one this learner can still see. */
  versionNumber: number | null;
}

export interface LessonView {
  id: string;
  slug: string;
  title: string;
  partTitle: string;
  durationMinutes: number;
  format: Lesson["format"];
  state: LessonState;
  /** When the learner did this lesson here, or the root completion for carried credit. */
  completedAt?: string;
  origin?: LessonOrigin;
  flagged: boolean;
}

export interface DeltaView {
  fromVersionNumber: number;
  changed: string[];
  added: string[];
  removed: string[];
}

export interface CourseView {
  title: string;
  subtitle: string;
  layer: CurriculumLayer;
  versionNumber: number;
  lessons: LessonView[];
  done: number;
  total: number;
  complete: boolean;
  /** The first lesson not done here, in course order. */
  next: LessonView | null;
  flaggedClaimIds: string[];
  delta: DeltaView | null;
}

export interface CourseViewInput {
  current: PublishedVersion;
  /** The learner's latest earlier version of this course in this gym, if any. */
  previous?: PublishedVersion;
  /** The learner's completions for this course in this gym, any version. */
  completions: readonly LessonCompletion[];
  /** Version numbers for every version id the completions mention, where visible. */
  versionNumbers: ReadonlyMap<string, number>;
  /** Claims in the current version whose source was retracted after publishing. */
  flaggedClaimIds: readonly string[];
}

export function courseView(input: CourseViewInput): CourseView {
  const { current, previous, completions, versionNumbers } = input;
  const flagged = new Set(input.flaggedClaimIds);
  const byId = new Map(completions.map((c) => [c.id, c]));
  const here = new Map(completions.filter((c) => c.versionId === current.id).map((c) => [c.lessonId, c]));
  const hashes = new Map(current.manifest.lessons.map((l) => [l.lessonId, l.contentHash]));
  const before = previous ? new Set(previous.manifest.lessons.map((l) => l.lessonId)) : null;

  const lessons = current.course.parts.flatMap((part) =>
    part.lessons.map((lesson): LessonView => {
      const base = {
        id: lesson.id,
        slug: lesson.slug,
        title: lesson.title,
        partTitle: part.title,
        durationMinutes: lesson.durationMinutes,
        format: lesson.format,
        flagged: lesson.blocks.some((b) => "claimIds" in b && b.claimIds.some((id) => flagged.has(id))),
      };
      const row = here.get(lesson.id);
      if (row && row.originCompletionId === null) return { ...base, state: "done", completedAt: row.completedAt };
      if (row) {
        const root = byId.get(row.originCompletionId!);
        const origin: LessonOrigin = root
          ? { completedAt: root.completedAt, versionNumber: versionNumbers.get(root.versionId) ?? null }
          : { completedAt: row.completedAt, versionNumber: null };
        return { ...base, state: "credited", completedAt: origin.completedAt, origin };
      }
      const hash = hashes.get(lesson.id);
      // Only an earlier version's completion can reopen a lesson; a newer one says nothing about this version.
      const doneElsewhere = completions.some(
        (c) => c.lessonId === lesson.id && c.contentHash !== hash && (versionNumbers.get(c.versionId) ?? Infinity) < current.versionNumber,
      );
      if (doneElsewhere) return { ...base, state: "updated" };
      if (before && !before.has(lesson.id)) return { ...base, state: "new" };
      return { ...base, state: "todo" };
    }),
  );

  const done = lessons.filter((l) => l.state === "done" || l.state === "credited").length;
  return {
    title: current.course.title,
    subtitle: current.course.subtitle,
    layer: current.layer,
    versionNumber: current.versionNumber,
    lessons,
    done,
    total: lessons.length,
    complete: lessons.length > 0 && done === lessons.length,
    next: lessons.find((l) => l.state !== "done" && l.state !== "credited") ?? null,
    flaggedClaimIds: [...flagged].sort(),
    delta: previous ? deltaView(diffVersions(previous.manifest, current.manifest), previous, current) : null,
  };
}

function deltaView(delta: VersionDelta, previous: PublishedVersion, current: PublishedVersion): DeltaView {
  const titles = new Map([...lessonsOf(previous.course), ...lessonsOf(current.course)].map((l) => [l.id, l.title]));
  const name = (id: string) => titles.get(id) ?? id;
  return {
    fromVersionNumber: previous.versionNumber,
    changed: delta.changed.map(name),
    added: delta.added.map(name),
    removed: delta.removed.map(name),
  };
}

/** The learner's latest assigned version of the course that is older than `current`. */
export function previousVersion<T extends { versionNumber: number }>(current: T, assigned: readonly T[]): T | undefined {
  return assigned
    .filter((v) => v.versionNumber < current.versionNumber)
    .sort((a, b) => b.versionNumber - a.versionNumber)[0];
}

/** Groups a learner's assignments by course: the newest version leads, older ones follow newest first. Keeps first-assigned course order. */
export function byCourse<T extends { courseId: string; versionNumber: number }>(items: readonly T[]): { latest: T; earlier: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(item.courseId, [...(groups.get(item.courseId) ?? []), item]);
  return [...groups.values()].map((group) => {
    const [latest, ...earlier] = [...group].sort((a, b) => b.versionNumber - a.versionNumber);
    return { latest: latest!, earlier };
  });
}

export const LAYER_LABEL: Record<CurriculumLayer, string> = {
  base: "Base",
  modality: "Modality",
  method: "Gym method",
};

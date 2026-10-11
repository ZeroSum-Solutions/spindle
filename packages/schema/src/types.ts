// Curriculum types. The Course → Part → Lesson → Block shape is carried over
// from the trainer-academy prototype; evidence binding and layers are new.

export type CurriculumLayer = "base" | "modality" | "method";
export type CourseLevel = "foundation" | "intermediate" | "advanced";
export type LessonFormat = "article" | "video" | "diagram" | "practice" | "quiz";
export type AssetKind = "image" | "video" | "diagram";

/** How a statement is supported. Only "science" may carry claim bindings. */
export type Support = "science" | "practice-based";

export interface MediaAsset {
  kind: AssetKind;
  src: string;
  alt: string;
  caption: string;
  provenanceId: string;
}

/** A block that states something about the body must say how it is supported. */
export interface Supported {
  support: Support;
  /** Approved claim record ids. Required and non-empty when support is "science". */
  claimIds: string[];
}

/**
 * A coaching clip from the practice-media registry (ADR 0007). The lesson
 * freezes these fields, so its hash seals the reference. A video is always
 * practice-based: it carries no support field and can never bind claims.
 */
export interface VideoSegment {
  /** The practice-media registry id. */
  mediaId: string;
  provider: "youtube";
  /** The 11-character YouTube video id. */
  videoId: string;
  startSeconds: number;
  endSeconds: number;
  /** Why the clip supports the section. */
  rationale: string;
  caption: string;
}

export type LessonBlock =
  | { kind: "heading"; content: string }
  | ({ kind: "paragraph"; content: string } & Supported)
  | ({ kind: "callout"; content: { label: string; text: string } } & Supported)
  | { kind: "image"; content: MediaAsset }
  | ({ kind: "checklist"; content: string[] } & Supported)
  | { kind: "diagram"; content: { diagramId: string; caption: string } }
  | ({
      kind: "quiz";
      content: { prompt: string; options: string[]; answerIndex: number; explanation: string };
    } & Supported)
  | { kind: "video"; content: VideoSegment };

export interface LessonResource {
  label: string;
  href: string;
  type: "worksheet" | "reference" | "transcript";
}

export interface Lesson<B = LessonBlock> {
  id: string;
  slug: string;
  title: string;
  summary: string;
  durationMinutes: number;
  format: LessonFormat;
  objectives: string[];
  /** Uberon anatomy ids, e.g. "UBERON:0001467" (shoulder). */
  anatomyIds: string[];
  blocks: B[];
  media: MediaAsset[];
  resources: LessonResource[];
}

export interface CoursePart<B = LessonBlock> {
  id: string;
  ordinal: number;
  title: string;
  summary: string;
  lessons: Lesson<B>[];
}

export interface Course<B = LessonBlock> {
  id: string;
  slug: string;
  layer: CurriculumLayer;
  title: string;
  subtitle: string;
  description: string;
  level: CourseLevel;
  outcomes: string[];
  parts: CoursePart<B>[];
}

export interface Catalog {
  version: string;
  courses: Course[];
}

export interface AssetProvenance {
  id: string;
  source: "original-svg" | "original-css" | "licensed" | "generated";
  createdAt: string;
  creator: string;
  rights: string;
}

/** A graded (science) quiz as learners receive it: no answer key or explanation (ADR 0007, learner_snapshot). */
export interface RedactedGradedQuiz {
  kind: "quiz";
  content: { prompt: string; options: string[] };
  support: "science";
  claimIds: string[];
}

/** Blocks a learner sees: every block kind, with graded quizzes redacted. Practice self-checks keep their answers. */
export type LearnerLessonBlock = LessonBlock | RedactedGradedQuiz;
export type LearnerCourse = Course<LearnerLessonBlock>;

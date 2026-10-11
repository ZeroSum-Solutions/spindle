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
    } & Supported);

export interface LessonResource {
  label: string;
  href: string;
  type: "worksheet" | "reference" | "transcript";
}

export interface Lesson {
  id: string;
  slug: string;
  title: string;
  summary: string;
  durationMinutes: number;
  format: LessonFormat;
  objectives: string[];
  /** Uberon anatomy ids, e.g. "UBERON:0001467" (shoulder). */
  anatomyIds: string[];
  blocks: LessonBlock[];
  media: MediaAsset[];
  resources: LessonResource[];
}

export interface CoursePart {
  id: string;
  ordinal: number;
  title: string;
  summary: string;
  lessons: Lesson[];
}

export interface Course {
  id: string;
  slug: string;
  layer: CurriculumLayer;
  title: string;
  subtitle: string;
  description: string;
  level: CourseLevel;
  outcomes: string[];
  parts: CoursePart[];
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

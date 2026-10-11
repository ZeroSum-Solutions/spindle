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

/** One labelled part of a diagram. `key` names the drawing's anchor; the text is reviewed teaching text. */
export interface DiagramLegendItem {
  key: string;
  label: string;
  text: string;
}

/**
 * A diagram's reviewable content (Sol R16): everything a learner reads lives here and is hashed with the
 * lesson. Code supplies only the drawing geometry, keyed by diagramId, with no explanatory text.
 */
export interface DiagramContent {
  diagramId: string;
  alt: string;
  caption: string;
  legend: DiagramLegendItem[];
}

export type LessonBlock =
  | { kind: "heading"; content: string }
  | ({ kind: "paragraph"; content: string } & Supported)
  | ({ kind: "callout"; content: { label: string; text: string } } & Supported)
  | { kind: "image"; content: MediaAsset }
  | ({ kind: "checklist"; content: string[] } & Supported)
  /** Legacy diagram (before R16): readable in old snapshots, refused in new authoring and at publish. */
  | { kind: "diagram"; content: { diagramId: string; caption: string } }
  | ({ kind: "diagram"; content: DiagramContent } & Supported)
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

/** The modality taxonomy (P4-A2 spec 2.4). "youth" means youth coaching education, never youth participation. */
export type ModalityTag =
  | "strength"
  | "powerlifting"
  | "weightlifting"
  | "hypertrophy"
  | "speed"
  | "mobility"
  | "yoga"
  | "pilates"
  | "running"
  | "endurance"
  | "combat"
  | "team-sport"
  | "youth";

export type CoverPattern = "solid" | "diagonal" | "grid" | "dots" | "rings" | "waves";

/** A Spindle-drawn cover for a gym method course: a pattern and two literal colours. Never an uploaded image. */
export interface CourseCover {
  kind: "pattern";
  pattern: CoverPattern;
  /** #RRGGBB */
  background: string;
  /** #RRGGBB, drawn faintly over the background. */
  foreground: string;
}

/**
 * A gym method course's welcome note as a published version carries it: only after LEAD admitted it,
 * with its author frozen at save. Drafts never carry it; it is saved through save_tenant_text.
 */
export interface CourseWelcome {
  text: string;
  /** LEAD's admission receipt. Members get the note only while it is live (version_tenant_texts). */
  receiptId: string;
  author: {
    authorUserId: string;
    /** Resolved at publish: the gym's admitted coach name, else its admitted brand name, else "Your gym". */
    displayName: string;
    /** The held slot the signature came from, or null for the fixed fallback. */
    signatureSlot: "coach_name" | "brand_name" | null;
    /** Its admission receipt; members see the fallback once it is revoked. */
    signatureReceiptId: string | null;
    orgId: string;
    /** ISO 8601, UTC, microseconds. */
    savedAt: string;
  };
}

export interface CourseBlurb {
  text: string;
  receiptId: string;
  author: { authorUserId: string; savedAt: string };
}

/**
 * A held course text of one published version as a member may see it now (version_tenant_texts):
 * "revoked" when LEAD withdrew the admission after publishing. A revoked title reads as the fallback.
 */
export interface VersionTenantText {
  slot: "course_title" | "welcome" | "course_blurb";
  state: "live" | "revoked";
  text: string | null;
  displayName: string | null;
  authorUserId: string | null;
  savedAt: string | null;
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
  /** Gym method courses only; base and modality courses use the Spindle cover. */
  cover?: CourseCover;
  /** At most two, from the modality taxonomy. Absent when empty. */
  tags?: ModalityTag[];
  /** Published versions of gym method courses only, once LEAD admitted it. */
  welcome?: CourseWelcome;
  /** The course card's one-line blurb: published versions of gym method courses only, once LEAD admitted it. */
  blurb?: CourseBlurb;
  /** Gym method courses: the admission receipt of the published title. */
  titleReceiptId?: string;
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

/** A graded question as a lesson page shows it: the prompt only; it is answered in the module quiz. */
export interface GradedPromptBlock {
  kind: "quiz";
  content: { prompt: string };
  support: "science";
  claimIds: string[];
}

/** Blocks the lesson pages render: every authored block except that graded quizzes are prompt-only. */
export type LessonViewBlock = LessonBlock | GradedPromptBlock;
export type LessonViewCourse = Course<LessonViewBlock>;

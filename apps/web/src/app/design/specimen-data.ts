// Synthetic specimen data for the /design kit and its screens. No database, no real curriculum.
import type { ClaimIntegrityState, LessonBlock } from "@spindle/schema";
import type { ClaimView } from "@/lib/learning/load";
import type { CourseView, LessonView } from "@/lib/learning/view";

/** Card facts for the course-row specimen (unused by the row itself; required by AssignmentSummary). */
export const SPECIMEN_CARD = { tags: [], lessonCount: 3, durationMinutes: 30, blurb: null };

export const CLAIM = "00000000-0000-4000-8000-0000000000c1";
export const FLAGGED = "00000000-0000-4000-8000-0000000000c2";
// The integrity report the specimen blocks render against (synthetic).
export const SPECIMEN_INTEGRITY = new Map<string, ClaimIntegrityState>([
  [CLAIM, "current"],
  [FLAGGED, "retracted"],
]);

export const claims = new Map<string, ClaimView>([
  [
    CLAIM,
    {
      id: CLAIM,
      statement: "Synthetic claim: this sentence stands in for an approved statement about a joint.",
      evidenceLevel: "Synthetic: systematic review",
      population: "Synthetic: healthy adults",
      sources: [
        { id: "s1", kind: "systematic_review", title: "Synthetic review title", doi: "10.0000/synthetic.0001", pmid: null, url: null, locator: null, license: "Synthetic", retractedAt: null },
      ],
    },
  ],
  [
    FLAGGED,
    {
      id: FLAGGED,
      statement: "Synthetic claim whose source was later retracted.",
      evidenceLevel: "Synthetic: randomized trial",
      population: "Synthetic: trained adults",
      sources: [
        { id: "s2", kind: "textbook", title: "Synthetic textbook", doi: null, pmid: "12345678", url: null, locator: "Synthetic ed., p. 1", license: "Synthetic", retractedAt: "2026-10-09T12:00:00+00:00" },
      ],
    },
  ],
]);

export const blocks: LessonBlock[] = [
  { kind: "heading", content: "Synthetic heading" },
  { kind: "paragraph", content: "A science paragraph in reading type. It binds one approved synthetic claim, so it shows the Science label and its sources.", support: "science", claimIds: [CLAIM] },
  { kind: "paragraph", content: "A practice-based paragraph. It carries no claim, so it says it comes from coaching practice.", support: "practice-based", claimIds: [] },
  { kind: "callout", content: { label: "Coach note", text: "A synthetic callout block." }, support: "practice-based", claimIds: [] },
  { kind: "checklist", content: ["First synthetic step", "Second synthetic step"], support: "science", claimIds: [FLAGGED] },
  { kind: "image", content: { kind: "image", src: "/media/content/synthetic/missing.png", alt: "Synthetic missing figure", caption: "A storage figure that is not available.", provenanceId: "synthetic" } },
  { kind: "diagram", content: { diagramId: "synthetic-diagram", caption: "A diagram block without an asset yet." } },
  {
    kind: "diagram",
    content: {
      diagramId: "shoulder-complex-front",
      alt: "Synthetic alt text: a schematic left shoulder from the front.",
      caption: "Synthetic caption for a reviewed science diagram. Schematic, not to scale.",
      legend: [
        { key: "sternoclavicular", label: "Synthetic place one.", text: "Synthetic legend text." },
        { key: "acromioclavicular", label: "Synthetic place two.", text: "" },
        { key: "glenohumeral", label: "Synthetic place three.", text: "" },
        { key: "scapula", label: "Synthetic place four.", text: "" },
      ],
    },
    support: "science",
    claimIds: [CLAIM],
  },
  {
    kind: "diagram",
    content: {
      diagramId: "scapula-upward-rotation",
      alt: "Synthetic alt text: three positions of a shoulder blade.",
      caption: "Synthetic caption for a reviewed practice diagram. Schematic, not to scale.",
      legend: [
        { key: "arm-by-side", label: "Synthetic panel one.", text: "" },
        { key: "arm-level", label: "Synthetic panel two.", text: "" },
        { key: "arm-overhead", label: "Synthetic panel three.", text: "" },
      ],
    },
    support: "practice-based",
    claimIds: [],
  },
  {
    kind: "quiz",
    content: { prompt: "Synthetic self-check: which option is right?", options: ["Option A", "Option B", "Option C"], answerIndex: 1, explanation: "Option B is the synthetic answer." },
    support: "science",
    claimIds: [CLAIM],
  },
];

export const lesson = (n: number, state: LessonView["state"], extra: Partial<LessonView> = {}): LessonView => ({
  id: `l${n}`,
  slug: `synthetic-lesson-${n}`,
  title: `Synthetic lesson ${n}`,
  partId: "p1",
  partTitle: "Part one",
  durationMinutes: 6,
  format: "article",
  state,
  flagged: false,
  ...extra,
});

export const view: CourseView = {
  title: "Synthetic course",
  subtitle: "Specimen data only",
  layer: "base",
  versionNumber: 2,
  lessons: [
    lesson(1, "credited", { completedAt: "2026-10-01T10:00:00+00:00", origin: { completedAt: "2026-10-01T10:00:00+00:00", versionNumber: 1 } }),
    lesson(2, "updated", { flagged: true }),
    lesson(3, "new"),
    lesson(4, "todo"),
    lesson(5, "done", { completedAt: "2026-10-10T10:00:00+00:00" }),
  ],
  done: 2,
  total: 5,
  complete: false,
  next: null,
  flaggedClaimIds: [FLAGGED],
  delta: { fromVersionNumber: 1, changed: ["Synthetic lesson 2"], added: ["Synthetic lesson 3"], removed: ["Retired synthetic lesson"] },
};

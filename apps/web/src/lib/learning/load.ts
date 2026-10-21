import "server-only";
import { notFound } from "next/navigation";
import { z } from "zod";
import { slugSchema } from "@/lib/forms";
import { fetchAll, fetchByIds } from "./paginate";
import { createClient, currentUser } from "@/lib/supabase/server";
import {
  completionsFrom,
  courseView,
  lessonsOf,
  previousVersion,
  publishedVersion,
  VersionUnavailableError,
  type CompletionRow,
  type CourseView,
  type ManifestRow,
  type PublishedVersion,
  type VersionRow,
} from "./view";
import { cardSummary, shownCourseTitle } from "@/components/brand/adapt";
import { memberVersionTexts, NO_VERSION_TEXTS, type VersionTexts } from "./tenant";

// Every read here runs as the signed-in user, so RLS applies, and every query also
// names the route gym and the user. Owners and leads can read other members' rows
// through RLS; the learner pages must only ever show the caller's own.

type Client = Awaited<ReturnType<typeof createClient>>;

export interface LearnerGym {
  supabase: Client;
  me: { id: string };
  org: { id: string; name: string; slug: string };
}

const uuid = z.uuid();

/** Every row of a paged read; a failure surfaces as the given user-facing message. */
async function loadAll<T>(message: string, page: Parameters<typeof fetchAll<T>>[0]): Promise<T[]> {
  try {
    return await fetchAll(page);
  } catch {
    throw new Error(message);
  }
}

/** The route gym, only if the signed-in user is a member. Anything else is a 404. */
export async function learnerGym(rawSlug: string): Promise<LearnerGym> {
  const slug = slugSchema.safeParse(rawSlug);
  const me = await currentUser();
  if (!slug.success || !me) notFound();
  const supabase = await createClient();
  const { data: org, error } = await supabase.from("orgs").select("id, name, slug").eq("slug", slug.data).maybeSingle();
  if (error) throw new Error("Could not load this gym.");
  if (!org) notFound();
  return { supabase, me: { id: me.id }, org };
}

interface AssignmentRow {
  id: string;
  version: VersionRow & { course_id: string };
}

// Learners read the redacted projection only (ADR 0007, T21); the raw snapshot column is not granted to them.
const ASSIGNMENT_SELECT = "id, curriculum_versions!inner(id, course_id, version_number, layer, org_id, snapshot:learner_snapshot, rules, question_set_hash)";

function toAssignment(row: { id: string; curriculum_versions: unknown }): AssignmentRow {
  return { id: row.id, version: row.curriculum_versions as AssignmentRow["version"] };
}

async function myAssignmentRows(ctx: LearnerGym): Promise<AssignmentRow[]> {
  const rows = await loadAll("Could not load your courses.", (from, to) =>
    ctx.supabase
      .from("assignments")
      .select(ASSIGNMENT_SELECT)
      .eq("org_id", ctx.org.id)
      .eq("user_id", ctx.me.id)
      .order("assigned_at")
      .order("id")
      .range(from, to),
  );
  return rows.map(toAssignment);
}

async function manifests(ctx: LearnerGym, versionIds: string[]): Promise<Map<string, ManifestRow[]>> {
  const byVersion = new Map<string, ManifestRow[]>(versionIds.map((v) => [v, []]));
  if (versionIds.length === 0) return byVersion;
  const data = await loadAll("Could not load course lessons.", (from, to) =>
    ctx.supabase
      .from("version_lessons")
      .select("version_id, lesson_id, ordinal, content_hash")
      .in("version_id", versionIds)
      .order("version_id")
      .order("ordinal")
      .range(from, to),
  );
  for (const row of data) byVersion.get(row.version_id)?.push(row);
  return byVersion;
}

async function myCompletions(ctx: LearnerGym, versionIds: string[]): Promise<CompletionRow[]> {
  if (versionIds.length === 0) return [];
  return loadAll("Could not load your progress.", (from, to) =>
    ctx.supabase
      .from("lesson_completions")
      .select("id, version_id, lesson_id, content_hash, completed_at, origin_completion_id")
      .eq("org_id", ctx.org.id)
      .eq("user_id", ctx.me.id)
      .in("version_id", versionIds)
      .order("id")
      .range(from, to),
  );
}

async function flaggedClaims(ctx: LearnerGym, versionIds: string[]): Promise<Map<string, string[]>> {
  const byVersion = new Map<string, string[]>(versionIds.map((v) => [v, []]));
  if (versionIds.length === 0) return byVersion;
  const data = await loadAll("Could not load integrity flags.", (from, to) =>
    ctx.supabase
      .from("version_flags")
      .select("version_id, claim_id, source_id")
      .in("version_id", versionIds)
      .order("version_id")
      .order("claim_id")
      .order("source_id")
      .range(from, to),
  );
  for (const row of data) byVersion.get(row.version_id)?.push(row.claim_id);
  return byVersion;
}

/** What a catalog card shows of an assigned version: facts of that exact version (Sol R1 on #45). */
export interface CardFacts {
  cover?: { pattern: "solid" | "diagonal" | "grid" | "dots" | "rings" | "waves"; background: string; foreground: string };
  tags: string[];
  lessonCount: number;
  durationMinutes: number;
  /** The version's live blurb (version_tenant_texts), or null. */
  blurb: string | null;
}

function cardFacts(version: PublishedVersion, texts: VersionTexts): CardFacts {
  const lessons = lessonsOf(version.course);
  const cover = version.learnerCourse.cover;
  return {
    ...(cover ? { cover: { pattern: cover.pattern, background: cover.background, foreground: cover.foreground } } : {}),
    tags: [...(version.learnerCourse.tags ?? [])],
    lessonCount: lessons.length,
    durationMinutes: lessons.reduce((sum, l) => sum + l.durationMinutes, 0),
    // Spindle's courses show their published subtitle; gym courses only an admitted blurb (Sol R2 on #45).
    blurb: cardSummary(version.layer, version.learnerCourse.subtitle, texts.blurb),
  };
}

export type AssignmentSummary =
  | { id: string; courseId: string; versionNumber: number; available: true; view: CourseView; card: CardFacts }
  | { id: string; courseId: string; versionNumber: number; available: false };

/** The caller's assignments in the route gym, each with its own version's progress. */
export async function myAssignments(ctx: LearnerGym): Promise<AssignmentSummary[]> {
  const rows = await myAssignmentRows(ctx);
  const ids = rows.map((r) => r.version.id);
  const [lessonRows, completionRows, flags] = await Promise.all([manifests(ctx, ids), myCompletions(ctx, ids), flaggedClaims(ctx, ids)]);
  const completions = completionsFrom(completionRows);
  const numbers = new Map(rows.map((r) => [r.version.id, r.version.version_number]));
  const versions = new Map<string, PublishedVersion | null>();
  for (const r of rows) versions.set(r.version.id, tryVersion(r.version, lessonRows.get(r.version.id) ?? []));

  // A gym course's title reads "Untitled course" once its admission is revoked (version_tenant_texts).
  const texts = new Map(
    await Promise.all(
      rows.filter((r) => versions.get(r.version.id)?.layer === "method").map(async (r) => [r.version.id, await memberVersionTexts(ctx, r.version.id)] as const),
    ),
  );
  return rows.map((r) => {
    const current = versions.get(r.version.id);
    const meta = { id: r.id, courseId: r.version.course_id, versionNumber: r.version.version_number };
    if (!current) return { ...meta, available: false };
    const sameCourse = rows.filter((o) => o.version.course_id === r.version.course_id).map((o) => versions.get(o.version.id));
    const previous = previousVersion(current, sameCourse.filter((v): v is PublishedVersion => Boolean(v)));
    const view = courseView({ current, previous, completions, versionNumbers: numbers, flaggedClaimIds: flags.get(r.version.id) ?? [] });
    const t = texts.get(r.version.id) ?? NO_VERSION_TEXTS;
    return { ...meta, available: true, view: { ...view, title: shownCourseTitle(view.title, t) }, card: cardFacts(current, t) };
  });
}

function tryVersion(row: VersionRow, lessons: ManifestRow[]): PublishedVersion | null {
  try {
    return publishedVersion(row, lessons);
  } catch (error) {
    if (error instanceof VersionUnavailableError) return null;
    throw error;
  }
}

export type AssignmentDetail =
  | { available: true; assignmentId: string; version: PublishedVersion; view: CourseView; texts: VersionTexts }
  | { available: false; assignmentId: string; versionNumber: number };

/**
 * One of the caller's own assignments in the route gym. Another member's
 * assignment, another gym's, or a malformed id is a 404 — never a hint that it exists.
 */
export async function myAssignment(ctx: LearnerGym, rawId: string): Promise<AssignmentDetail> {
  const assignmentId = uuid.safeParse(rawId);
  if (!assignmentId.success) notFound();
  const { data, error } = await ctx.supabase
    .from("assignments")
    .select(ASSIGNMENT_SELECT)
    .eq("id", assignmentId.data)
    .eq("org_id", ctx.org.id)
    .eq("user_id", ctx.me.id)
    .maybeSingle();
  if (error) throw new Error("Could not load this course.");
  if (!data) notFound();
  const assignment = toAssignment(data);

  // Earlier versions of the same course assigned to me here, for the delta and lineage.
  const all = (await myAssignmentRows(ctx)).filter((r) => r.version.course_id === assignment.version.course_id);
  const ids = all.map((r) => r.version.id);
  const [lessonRows, completionRows, flags] = await Promise.all([manifests(ctx, ids), myCompletions(ctx, ids), flaggedClaims(ctx, [assignment.version.id])]);
  const current = tryVersion(assignment.version, lessonRows.get(assignment.version.id) ?? []);
  if (!current) return { available: false, assignmentId: assignment.id, versionNumber: assignment.version.version_number };
  const older = all
    .filter((r) => r.version.version_number < current.versionNumber)
    .map((r) => tryVersion(r.version, lessonRows.get(r.version.id) ?? []))
    .filter((v): v is PublishedVersion => Boolean(v));
  const view = courseView({
    current,
    previous: previousVersion(current, older),
    completions: completionsFrom(completionRows),
    versionNumbers: new Map(all.map((r) => [r.version.id, r.version.version_number])),
    flaggedClaimIds: flags.get(current.id) ?? [],
  });
  // Held texts of a gym course: the title's state and the live welcome note and blurb.
  const texts = current.layer === "method" ? await memberVersionTexts(ctx, current.id) : NO_VERSION_TEXTS;
  return { available: true, assignmentId: assignment.id, version: current, view: { ...view, title: shownCourseTitle(view.title, texts) }, texts };
}

export interface SourceView {
  id: string;
  kind: string;
  title: string;
  doi: string | null;
  pmid: string | null;
  url: string | null;
  locator: string | null;
  license: string;
  retractedAt: string | null;
}

export interface ClaimView {
  id: string;
  statement: string;
  evidenceLevel: string;
  population: string;
  sources: SourceView[];
}

/** Approved-claim text and sources for the claims a lesson cites. Review receipts stay server-side (no select policy). */
export async function claimEvidence(ctx: LearnerGym, claimIds: string[]): Promise<Map<string, ClaimView>> {
  const ids = [...new Set(claimIds)];
  const result = new Map<string, ClaimView>();
  if (ids.length === 0) return result;
  let data;
  try {
    data = await fetchByIds(ids, (batch) =>
      ctx.supabase
        .from("claims")
        .select("id, statement, evidence_level, population, claim_sources(sources(id, kind, title, doi, pmid, url, locator, license, source_retractions(recorded_at)))")
        .in("id", batch),
    );
  } catch {
    throw new Error("Could not load sources.");
  }
  for (const claim of data) {
    const sources = (claim.claim_sources ?? []).flatMap((cs) => (cs.sources ? [cs.sources] : []));
    result.set(claim.id, {
      id: claim.id,
      statement: claim.statement,
      evidenceLevel: claim.evidence_level,
      population: claim.population,
      sources: sources
        .map((s) => ({
          id: s.id,
          kind: s.kind,
          title: s.title,
          doi: s.doi,
          pmid: s.pmid,
          url: s.url,
          locator: s.locator,
          license: s.license,
          retractedAt: retraction(s.source_retractions),
        }))
        .sort((a, b) => a.title.localeCompare(b.title)),
    });
  }
  return result;
}

function retraction(value: unknown): string | null {
  // One-to-one embeds come back as an object; older client versions return an array.
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object" && "recorded_at" in row ? String(row.recorded_at) : null;
}

/** The claim ids a lesson's blocks cite, in block order. */
export function lessonClaimIds(version: PublishedVersion, lessonId: string): string[] {
  const lesson = lessonsOf(version.course).find((l) => l.id === lessonId);
  return lesson ? lesson.blocks.flatMap((b) => ("claimIds" in b ? b.claimIds : [])) : [];
}

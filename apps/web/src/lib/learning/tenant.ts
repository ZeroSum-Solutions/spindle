import "server-only";
import { parseCourseCards, parseMemberBrandDto, parseVersionTenantTexts, type CourseCardDto, type MemberBrandDto } from "@spindle/schema";
import { versionTexts } from "@/components/brand/adapt";
import type { LearnerGym } from "./load";

// P4-A2 member reads (#38, #43). Each runs as the signed-in member: the security-definer RPCs check
// membership and return admitted tenant text only, and the #43 parsers validate the shape.
//
// Caching: nothing is cached yet. These reads run per request. When a cache is added, brand output
// is keyed org:{orgId}:brand:{revision}, card output org:{orgId}:cards:{revision} plus the version
// ids it covers, and personalized output (resume, progress) stays private and uncached (#43).

/** The gym's member-visible brand: the saved brand (or null) and admitted texts, with the name fallback. */
export async function memberBrand(ctx: LearnerGym): Promise<MemberBrandDto> {
  const { data, error } = await ctx.supabase.rpc("member_brand", { p_org: ctx.org.id });
  if (error) throw new Error("Could not load this gym's brand.");
  return parseMemberBrandDto(data);
}

/** The catalog's course cards: the latest version of every course a member of this gym can see. */
export async function memberCourseCards(ctx: LearnerGym): Promise<CourseCardDto[]> {
  const { data, error } = await ctx.supabase.rpc("member_course_cards", { p_org: ctx.org.id });
  if (error) throw new Error("Could not load this gym's courses.");
  return parseCourseCards(data);
}

export type VersionTexts = ReturnType<typeof versionTexts>;
export const NO_VERSION_TEXTS: VersionTexts = { titleRevoked: false, welcome: null, blurb: null };

/** What a member may see of one version's held texts (title state, welcome note, blurb). */
export async function memberVersionTexts(ctx: LearnerGym, versionId: string): Promise<VersionTexts> {
  const { data, error } = await ctx.supabase.rpc("version_tenant_texts", { p_version: versionId });
  if (error) throw new Error("Could not load this course's texts.");
  return versionTexts(parseVersionTenantTexts(data));
}

// Thin adapters from the #38/#43 member DTOs to the brand components' view models. Pure, so they
// are unit-tested; the server loaders (lib/learning/tenant.ts) only fetch and parse.
import type { CourseCardDto, MemberBrandDto, VersionTenantText } from "@spindle/schema";
import type { CatalogHeroView, CoachNoteView, CourseCardView, MemberBrandView } from "./view";

/** A branded member page's brand and hero, or null when the gym has no brand or its brand is refused. */
export function brandFromDto(_dto: MemberBrandDto): { brand: MemberBrandView; hero: CatalogHeroView } | null {
  return null;
}

/** A course card for an assigned course: the DTO's admitted texts, linked to the learner's assignment. */
export function cardFromDto(_card: CourseCardDto, _href: string): CourseCardView {
  throw new Error("not implemented");
}

/** What the player may show of a version's held texts: live texts only; a revoked title reads as the fallback. */
export function versionTexts(_rows: readonly VersionTenantText[]): { titleRevoked: boolean; welcome: CoachNoteView | null; blurb: string | null } {
  return { titleRevoked: false, welcome: null, blurb: null };
}

/** The course title a member sees: the published title, or "Untitled course" once its admission is revoked. */
export function shownCourseTitle(title: string, _texts: { titleRevoked: boolean }): string {
  return title;
}

// Thin adapters from the #38/#43 member DTOs to the brand components' view models. Pure, so they
// are unit-tested; the server loaders (lib/learning/tenant.ts) only fetch and parse.
import type { CourseCardDto, MemberBrandDto, VersionTenantText } from "@spindle/schema";
import { MODALITY_LABELS, memberColors, TENANT_TEXT_FALLBACKS, type CatalogHeroView, type CoachNoteView, type CourseCardView, type MemberBrandView, type ModalityTag } from "./view";

/** A branded member page's brand and hero, or null when the gym has no brand or its brand is refused. */
export function brandFromDto(dto: MemberBrandDto): { brand: MemberBrandView; hero: CatalogHeroView } | null {
  if (!dto.brand) return null;
  const colors = memberColors(dto.brand);
  if (!colors) return null;
  return {
    // The DTO's name is the admitted name or the fallback; the components show the fallback for null.
    brand: { name: dto.nameAdmitted ? dto.name : null, font: dto.brand.font, colors },
    // The DTO carries admitted catalog texts only; there are no catalog modality tags yet.
    hero: { headline: dto.texts.headline ?? null, tagline: dto.texts.tagline ?? null, modalities: [] },
  };
}

const isTag = (t: string): t is ModalityTag => Object.hasOwn(MODALITY_LABELS, t);

function duration(minutes: number): string {
  if (minutes < 60) return `About ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `About ${h} hr${m ? ` ${m} min` : ""}`;
}

/** A course card for an assigned course: the DTO's admitted texts, linked to the learner's assignment. */
export function cardFromDto(card: CourseCardDto, href: string): CourseCardView {
  return {
    id: card.versionId,
    href,
    layer: card.layer,
    // member_course_cards already shows the fallback for a revoked gym title.
    title: card.title,
    blurb: card.summary,
    tags: card.tags.filter(isTag).slice(0, 2),
    meta: `${card.lessonCount} ${card.lessonCount === 1 ? "lesson" : "lessons"} · ${duration(card.durationMinutes)}`,
    ...(card.cover ? { cover: { pattern: card.cover.pattern, background: card.cover.background, foreground: card.cover.foreground } } : {}),
  };
}

/** What the player may show of a version's held texts: live texts only; a revoked title reads as the fallback. */
export function versionTexts(rows: readonly VersionTenantText[]): { titleRevoked: boolean; welcome: CoachNoteView | null; blurb: string | null } {
  const live = (slot: VersionTenantText["slot"]) => rows.find((r) => r.slot === slot && r.state === "live" && r.text);
  const welcome = live("welcome");
  return {
    titleRevoked: rows.some((r) => r.slot === "course_title" && r.state === "revoked"),
    welcome: welcome ? { text: welcome.text!, displayName: welcome.displayName } : null,
    blurb: live("course_blurb")?.text ?? null,
  };
}

/** The course title a member sees: the published title, or "Untitled course" once its admission is revoked. */
export function shownCourseTitle(title: string, texts: { titleRevoked: boolean }): string {
  return texts.titleRevoked ? TENANT_TEXT_FALLBACKS.courseTitle : title;
}

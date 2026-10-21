import { canonicalPath } from "./preview-pages";

/**
 * The gym slug when a request path reaches the learner pages (`/gyms/<slug>/learn` or below, or a
 * suffixed variant such as an RSC payload), else null. The path is canonicalized as for test-only
 * pages, so encoded, doubled-slash and dot-segment spellings give the same answer.
 */
export function learnGymSlug(pathname: string): string | null {
  const [gyms, slug, learn] = canonicalPath(pathname).split("/").slice(1);
  if (gyms !== "gyms" || !slug || !learn) return null;
  return learn === "learn" || learn.startsWith("learn.") ? slug : null;
}

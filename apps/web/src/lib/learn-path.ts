import { canonicalPath } from "./preview-pages";

/** Percent-decoded repeatedly (as canonicalPath does), or the last form that decoded. */
function decodeSegment(segment: string): string {
  let out = segment;
  for (let i = 0; i < 4; i += 1) {
    try {
      const decoded = decodeURIComponent(out);
      if (decoded === out) break;
      out = decoded;
    } catch {
      break;
    }
  }
  return out;
}

/** "learn", or a suffixed variant such as an RSC payload ("learn.rsc"). */
const isLearn = (segment: string | undefined) => segment === "learn" || Boolean(segment?.startsWith("learn."));

/**
 * The gym slug when a request path reaches the learner pages (`/gyms/<slug>/learn` or below, or a
 * suffixed variant such as an RSC payload), else null. The path is canonicalized as for test-only
 * pages, so encoded, doubled-slash and dot-segment spellings match too.
 *
 * The router splits route segments before it decodes their contents, so a segment that decodes to a
 * slash or a dot segment (`..%2f..`) stays one route parameter while canonical decoding resolves it
 * away, possibly onto another gym. Such a segment has no legitimate use under /gyms, so the path
 * fails closed: it counts as a learner path with no usable slug (""), which the proxy answers 404.
 */
export function learnGymSlug(pathname: string): string | null {
  const segments = pathname.split("/").filter((s) => s !== "").map(decodeSegment);
  const [gyms, slug, learn] = canonicalPath(pathname).split("/").slice(1);
  const smuggled = segments.some((s) => /[/\\]/.test(s) || s === "." || s === "..");
  if (smuggled && (segments[0]?.toLowerCase() === "gyms" || gyms === "gyms")) return "";
  return gyms === "gyms" && slug && isLearn(learn) ? slug : null;
}

/** Percent-decoded until stable (so a double-encoded segment cannot slip through), or null if it never decodes cleanly. */
function decodeSegment(segment: string): string | null {
  let out = segment;
  for (let i = 0; i < 8; i += 1) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(out);
    } catch {
      return null;
    }
    if (decoded === out) return out;
    out = decoded;
  }
  return null;
}

/** Best-effort ASCII decoding of the whole path, only to tell whether it could be about /gyms. */
function looseDecode(pathname: string): string {
  let out = pathname;
  for (let i = 0; i < 4; i += 1) {
    const next = out.replace(/%([0-7][0-9a-f])/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
    if (next === out) break;
    out = next;
  }
  return out.toLowerCase();
}

/** "learn", or a suffixed variant such as an RSC payload ("learn.rsc"). */
const isLearn = (segment: string | undefined) => segment === "learn" || Boolean(segment?.startsWith("learn."));

/**
 * The gym slug when a request path reaches the learner pages (`/gyms/<slug>/learn` or below, or a
 * suffixed variant such as an RSC payload), else null.
 *
 * The router splits the path into segments first and decodes each one on its own, so this does the
 * same: encoded and double-encoded segments and doubled slashes read as the router reads them, and
 * one undecodable segment cannot leave the others encoded. A segment that will not decode, or that
 * decodes to a slash, a backslash or a dot segment (`..%2f..`), has no legitimate use; if the path
 * could be about /gyms at all, it fails closed as a learner path with no usable slug (""), which the
 * proxy answers 404.
 */
export function learnGymSlug(pathname: string): string | null {
  const raw = pathname.split("/").filter((s) => s !== "");
  const decoded = raw.map(decodeSegment);
  const bad = decoded.some((s) => s === null || /[/\\]/.test(s) || s === "." || s === "..");
  if (bad) return looseDecode(pathname).includes("gyms") ? "" : null;
  const [gyms, slug, learn] = (decoded as string[]).map((s) => s.toLowerCase());
  return gyms === "gyms" && slug && isLearn(learn) ? slug : null;
}

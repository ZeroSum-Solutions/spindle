// Where lesson media and resource links may point. Ingress (parseCourse) already
// limits them to root-relative paths or https URLs; this narrows site paths to the
// authenticated media handler and to the storage area the content may use.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// The ingress path grammar, one segment at a time, with no dot segments.
const SEGMENT = /^[A-Za-z0-9._~-]+$/;

export type StorageBucket = "org-media" | "content-media";

export interface StorageObject {
  bucket: StorageBucket;
  /** The object name inside the bucket. org-media names start with the gym id. */
  name: string;
}

/**
 * Maps a `/media/...` route path to one storage object, or null. Shared by the
 * route handler and the renderer so both accept exactly the same grammar.
 *   /media/org/<org_id>/<path>  → org-media  "<org_id>/<path>"
 *   /media/content/<path>       → content-media "<path>"
 */
export function storageObjectFor(segments: readonly string[]): StorageObject | null {
  if (segments.some((s) => !SEGMENT.test(s) || s === "." || s === "..")) return null;
  const [area, ...rest] = segments;
  if (area === "org") {
    const [orgId, ...path] = rest;
    if (!orgId || !UUID.test(orgId) || path.length === 0) return null;
    return { bucket: "org-media", name: [orgId, ...path].join("/") };
  }
  if (area === "content" && rest.length > 0) return { bucket: "content-media", name: rest.join("/") };
  return null;
}

export type ResolvedLink = { kind: "external"; url: string } | { kind: "media"; url: string } | { kind: "unavailable" };

/**
 * How the player may use a content URL. Gym media may only come from the gym that
 * owns the version; global content may only use global media. The media handler
 * authorizes every request again on its own.
 */
export function resolveContentUrl(src: string, owner: { orgId: string | null }): ResolvedLink {
  if (src.startsWith("https://")) return { kind: "external", url: src };
  if (!src.startsWith("/media/")) return { kind: "unavailable" };
  const object = storageObjectFor(src.slice("/media/".length).split("/"));
  if (!object) return { kind: "unavailable" };
  if (object.bucket === "org-media" && object.name.split("/")[0] !== owner.orgId) return { kind: "unavailable" };
  return { kind: "media", url: src };
}

/** Content types the media handler streams itself. Anything else is refused, never sniffed. */
export const SERVABLE_MEDIA = /^(image\/(png|jpeg|gif|webp|avif)|application\/pdf)$/;

/** How long a signed video URL lives. Players need byte ranges, which Storage serves directly. */
export const VIDEO_URL_SECONDS = 60;

/** Video is redirected to a short-lived signed Storage URL instead of streamed. Decided by the object's stored MIME type. */
export function isVideoType(contentType: string | undefined): boolean {
  return /^video\/(mp4|webm)$/.test((contentType ?? "").toLowerCase().split(";")[0]!.trim());
}

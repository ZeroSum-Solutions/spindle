import { z } from "zod";

// Click-to-load YouTube segments (D-09, phase 3 plan section 6). Pure helpers only:
// no network and no DOM, so the rules are unit-tested. The prop shape is provisional
// until the practice-media registry lands; it mirrors what a published lesson freezes
// (id, start, end, rationale) plus refreshable provider data (title, channel).

/** The only host a player frame may come from. */
export const PLAYER_ORIGIN = "https://www.youtube-nocookie.com";
/** The official IFrame API loader. Loaded only after the learner presses play. */
export const IFRAME_API_URL = "https://www.youtube.com/iframe_api";
/** Where the loader fetches the widget script from (a versioned path under this prefix). */
export const WIDGET_SCRIPT_PREFIX = "https://www.youtube.com/s/player/";
export const PRIVACY_URL = "https://policies.google.com/privacy";
export const TERMS_URL = "https://www.youtube.com/t/terms";
/** How long to wait for the player to report ready before saying it is unavailable. */
export const READY_TIMEOUT_MS = 15_000;

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export const youTubeVideoSchema = z
  .object({
    videoId: z.string().regex(VIDEO_ID, "not a YouTube video id"),
    start: z.number().int().min(0),
    end: z.number().int().positive().optional(),
    title: z.string().trim().min(1).max(200),
    channel: z.string().trim().min(1).max(120),
    rationale: z.string().trim().min(1).max(500),
  })
  .strict()
  .refine((v) => v.end === undefined || v.end > v.start, { message: "end must be after start", path: ["end"] });

export type YouTubeVideo = z.infer<typeof youTubeVideoSchema>;

/** Player frame URL: privacy-enhanced host, official controls, our segment, JS API for error reporting. */
export function embedSrc(video: YouTubeVideo, pageOrigin: string): string {
  const id = parseVideoId(video.videoId);
  const params = new URLSearchParams({
    autoplay: "1", // the learner just pressed play
    playsinline: "1",
    rel: "0",
    enablejsapi: "1",
    origin: new URL(pageOrigin).origin,
    start: String(video.start),
  });
  if (video.end !== undefined) params.set("end", String(video.end));
  return `${PLAYER_ORIGIN}/embed/${id}?${params}`;
}

/** The fallback link: the same video on YouTube, at the segment start. */
export function watchUrl(video: Pick<YouTubeVideo, "videoId" | "start">): string {
  const params = new URLSearchParams({ v: parseVideoId(video.videoId) });
  if (video.start > 0) params.set("t", `${video.start}s`);
  return `https://www.youtube.com/watch?${params}`;
}

/** "1:05 to 2:30" for the caption, so the learner knows which part plays. */
export function segmentLabel(video: Pick<YouTubeVideo, "start" | "end">): string {
  const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  return video.end === undefined ? `From ${clock(video.start)}` : `${clock(video.start)} to ${clock(video.end)}`;
}

function parseVideoId(id: string): string {
  if (!VIDEO_ID.test(id)) throw new Error("not a YouTube video id");
  return id;
}

// Player states. Nothing from YouTube exists in "idle"; "unavailable" is final for this mount.
export type PlayerState = "idle" | "loading" | "ready" | "unavailable";
export type PlayerEvent = "activate" | "ready" | "error" | "timeout" | "script-failed";

export function nextPlayerState(state: PlayerState, event: PlayerEvent): PlayerState {
  switch (state) {
    case "idle":
      return event === "activate" ? "loading" : state;
    case "loading":
      if (event === "ready") return "ready";
      return event === "error" || event === "timeout" || event === "script-failed" ? "unavailable" : state;
    case "ready":
      // A late timeout cannot undo a player that already reported ready.
      return event === "error" ? "unavailable" : state;
    case "unavailable":
      return state;
  }
}

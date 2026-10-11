import type { MediaAvailability, VideoSegment } from "@spindle/schema";

// Click-to-load YouTube segments (D-09, ADR 0007). Pure helpers only: no network and no
// DOM, so the rules are unit-tested. The segment comes frozen from the lesson's video
// block (registry id, video id, start, end, rationale); title, channel and availability
// are refreshable provider data from version_media, never part of the lesson.

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
/** How long play waits for the registry recheck before it fails closed. */
export const RECHECK_TIMEOUT_MS = 8_000;

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

type Segment = Pick<VideoSegment, "videoId" | "startSeconds" | "endSeconds">;

/** Player frame URL: privacy-enhanced host, official controls, the frozen segment, JS API for error reporting. */
export function embedSrc(segment: Segment, pageOrigin: string): string {
  const params = new URLSearchParams({
    autoplay: "1", // the learner just pressed play
    playsinline: "1",
    rel: "0",
    enablejsapi: "1",
    origin: new URL(pageOrigin).origin,
    start: String(segment.startSeconds),
    end: String(segment.endSeconds),
  });
  return `${PLAYER_ORIGIN}/embed/${videoId(segment.videoId)}?${params}`;
}

/** The fallback link: the same video on YouTube, at the segment start. */
export function watchUrl(segment: Pick<VideoSegment, "videoId" | "startSeconds">): string {
  const params = new URLSearchParams({ v: videoId(segment.videoId) });
  if (segment.startSeconds > 0) params.set("t", `${segment.startSeconds}s`);
  return `https://www.youtube.com/watch?${params}`;
}

/** "1:05 to 2:30" for the caption, so the learner knows which part plays. */
export function segmentLabel(segment: Pick<VideoSegment, "startSeconds" | "endSeconds">): string {
  const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  return `${clock(segment.startSeconds)} to ${clock(segment.endSeconds)}`;
}

function videoId(id: string): string {
  if (!VIDEO_ID.test(id)) throw new Error("not a YouTube video id");
  return id;
}

/**
 * Whether a clip may be offered, from version_media. Fails closed: a clip the
 * registry did not report, or reports as disabled, is "off" and nothing from
 * YouTube is offered. A clip the provider says is unavailable is "gone": it is
 * shown as unavailable, with the link to YouTube.
 */
export type ClipState = "playable" | "off" | "gone";

export function clipState(availability: MediaAvailability | undefined): ClipState {
  if (!availability || availability.state !== "playable") return "off";
  if (availability.available === false) return "gone";
  return "playable";
}

/** What the facade shows. Provider title and channel are null unless fetched in the last 30 days. */
export function clipLabels(availability: MediaAvailability | undefined): { title: string; channel: string } {
  return { title: availability?.title ?? "Coaching video", channel: availability?.channel ?? "YouTube" };
}

// Player states. Nothing from YouTube exists in "idle". "blocked": the registry no longer
// allows the clip when play was pressed, so nothing loads. Both end states are final for this mount.
export type PlayerState = "idle" | "loading" | "ready" | "unavailable" | "blocked";
export type PlayerEvent = "activate" | "ready" | "error" | "timeout" | "script-failed" | "blocked";

export function nextPlayerState(state: PlayerState, event: PlayerEvent): PlayerState {
  switch (state) {
    case "idle":
      return event === "activate" ? "loading" : state;
    case "loading":
      if (event === "ready") return "ready";
      if (event === "blocked") return "blocked";
      return event === "error" || event === "timeout" || event === "script-failed" ? "unavailable" : state;
    case "ready":
      // A late timeout cannot undo a player that already reported ready.
      return event === "error" ? "unavailable" : state;
    case "unavailable":
    case "blocked":
      return state;
  }
}

/**
 * Runs the registry recheck that gates play, bounded by a deadline. It resolves true only
 * when the check answers true in time; a missing check, a rejection, a non-true answer or the
 * deadline all resolve false. A late answer is ignored: the result is already settled.
 */
export function boundedRecheck(
  recheck: (() => Promise<boolean>) | undefined,
  timeoutMs: number = RECHECK_TIMEOUT_MS,
  timers: { set: (fn: () => void, ms: number) => unknown; clear: (id: unknown) => void } = {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  },
): Promise<boolean> {
  if (!recheck) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    const timer = timers.set(() => resolve(false), timeoutMs);
    let pending: Promise<boolean>;
    try {
      pending = recheck();
    } catch {
      timers.clear(timer);
      resolve(false);
      return;
    }
    Promise.resolve(pending).then(
      (allowed) => {
        timers.clear(timer);
        resolve(allowed === true);
      },
      () => {
        timers.clear(timer);
        resolve(false);
      },
    );
  });
}

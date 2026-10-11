// YouTube registry admission (ADR 0007, D-09). The oEmbed endpoint is a
// preflight: 200 means the uploader allows embedding; 401/403 means embedding
// is off; 404 means the video is gone. Anything else is an error, never a pass.
import { z } from "zod";
import type { EvidenceContext } from "./context";
import { EvidenceHttpError, sanitize } from "./http";

const oembedSchema = z.object({
  title: z.string().min(1).max(500),
  author_name: z.string().min(1).max(200),
  type: z.literal("video"),
  provider_name: z.literal("YouTube"),
});

export const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

export type EmbedCheck =
  | { status: "embeddable"; title: string; channel: string; checkedAt: string }
  | { status: "not_embeddable" | "missing" | "error"; detail: string; checkedAt: string };

export async function checkYouTubeEmbed(ctx: EvidenceContext, videoId: string): Promise<EmbedCheck> {
  if (!YOUTUBE_ID.test(videoId)) throw new Error("not a YouTube video id");
  const checkedAt = ctx.now().toISOString();
  const watch = `https://www.youtube.com/watch?v=${videoId}`;
  const url = `https://www.youtube.com/oembed?${new URLSearchParams({ url: watch, format: "json" })}`;
  try {
    const data = await ctx.http.fetchJson(url, oembedSchema, { userAgent: ctx.userAgent(), nullStatuses: [401, 403], requireStatus: 200 });
    if (data) return { status: "embeddable", title: data.title, channel: data.author_name, checkedAt };
    return { status: "not_embeddable", detail: "oEmbed refused embedding (401/403)", checkedAt };
  } catch (e) {
    if (e instanceof EvidenceHttpError && e.status === 404) return { status: "missing", detail: "oEmbed 404", checkedAt };
    return { status: "error", detail: sanitize(e instanceof Error ? e.message : String(e)).slice(0, 300), checkedAt };
  }
}

/** Registry actions for a recheck: a pass records an embed check; anything else records a failure and disables the clip. */
export function embedRecheckActions(check: EmbedCheck): { outcome: "pass" | "fail"; disable: boolean; notes: string } {
  if (check.status === "embeddable") return { outcome: "pass", disable: false, notes: "oEmbed 200" };
  return { outcome: "fail", disable: true, notes: `oEmbed ${check.status}: ${check.detail}`.slice(0, 2000) };
}

export type RefreshAction =
  | { action: "refresh"; available: true; title: string; channel: string }
  | { action: "unavailable"; available: false; embedOutcome: "fail"; notes: string }
  | { action: "unknown"; detail: string };

/**
 * What a metadata refresh does: store fresh metadata; for a confirmed refusal or removal, store
 * `available: false` and record a failed embed check (playback stops); for a transient error, change nothing.
 */
export function metadataRefreshAction(check: EmbedCheck): RefreshAction {
  if (check.status === "embeddable") return { action: "refresh", available: true, title: check.title, channel: check.channel };
  if (check.status === "error") return { action: "unknown", detail: check.detail };
  return { action: "unavailable", available: false, embedOutcome: "fail", notes: `oEmbed ${check.status}: ${check.detail}`.slice(0, 2000) };
}

/** Provider metadata older than this is refreshed (it is served only while under 30 days old). */
export const METADATA_REFRESH_DAYS = 25;

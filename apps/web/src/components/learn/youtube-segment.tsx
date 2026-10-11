import type { MediaAvailability, VideoSegment } from "@spindle/schema";
import { clipLabels, clipState } from "../../lib/video/youtube";
import { SupportLabel } from "./labels";
import { YouTubePlayer } from "./youtube-player";

/**
 * An optional coaching clip from the practice-media registry. Always practice-based (a
 * video is never a science source) and never needed to complete a lesson. The segment
 * comes frozen from the lesson; whether it may play comes from version_media, checked
 * before anything is mounted: a clip the registry did not report or has switched off
 * offers nothing from YouTube.
 */
export function YouTubeSegment({
  segment,
  availability,
  versionId,
  recheck,
}: {
  segment: VideoSegment;
  availability: MediaAvailability | undefined;
  /** The version the lesson belongs to; play rechecks the registry for it. */
  versionId?: string;
  /** Overrides the recheck (the design specimen only). Without either, play fails closed. */
  recheck?: () => Promise<boolean>;
}) {
  const state = clipState(availability);
  const mediaId = segment.mediaId;
  // Bound on the server: the client can call it but cannot change which version or clip it asks about.
  async function recheckClip(): Promise<boolean> {
    "use server";
    if (!versionId) return false;
    // Loaded on call so this component imports no server-only module and renders in unit tests.
    const { clipPlayableNow } = await import("../../lib/learning/version-media");
    return clipPlayableNow(versionId, mediaId);
  }
  const { title, channel } = clipLabels(availability);
  return (
    <figure data-block="video" data-support="practice-based" data-clip={state} className="flex flex-col gap-3">
      <p className="flex flex-wrap items-center gap-2 text-label text-text-muted">
        <SupportLabel support="practice-based" />
        <span>Optional video</span>
        {availability?.review === "model-described" ? (
          // D-11: a model described this segment and Sol reviewed the description; a person has not checked it yet.
          <span data-review="model-described">· Clip described by a model; human check pending</span>
        ) : null}
      </p>
      {state === "off" ? (
        <p data-video="off" className="rounded-card bg-surface-muted p-4 text-base text-text-muted">
          This video is switched off for now.
        </p>
      ) : (
        <YouTubePlayer
          // A new key whenever the clip or its availability changes, so the player never keeps stale state.
          key={`${mediaId}:${state}`}
          video={{ videoId: segment.videoId, startSeconds: segment.startSeconds, endSeconds: segment.endSeconds, title, channel }}
          gone={state === "gone"}
          recheck={recheck ?? (versionId ? recheckClip : undefined)}
        />
      )}
      <figcaption className="flex flex-col gap-1 text-base">
        <span className="text-text-muted">{segment.rationale}</span>
        {segment.caption ? <span className="text-label text-text-muted">{segment.caption}</span> : null}
        <span className="text-label text-text-muted">You can complete this lesson without watching it.</span>
      </figcaption>
    </figure>
  );
}

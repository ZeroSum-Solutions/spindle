import { SupportLabel } from "@/components/learn/labels";
import { MediaUnavailable } from "@/components/learn/media-image";
import { YouTubePlayer } from "@/components/learn/youtube-player";
import { segmentLabel, youTubeVideoSchema, type YouTubeVideo } from "@/lib/video/youtube";

/**
 * An optional coaching video segment. Always practice-based (a video is never a science
 * source) and never needed to complete a lesson. Props are validated here because they
 * will come from the practice-media registry.
 */
export function YouTubeSegment({ video }: { video: YouTubeVideo }) {
  const parsed = youTubeVideoSchema.safeParse(video);
  if (!parsed.success) return <MediaUnavailable alt="Video" kind="video" />;
  const v = parsed.data;
  return (
    <figure data-block="video" data-support="practice-based" className="flex flex-col gap-3">
      <p className="flex flex-wrap items-center gap-2 text-label text-text-muted">
        <SupportLabel support="practice-based" />
        <span>Optional video</span>
      </p>
      <YouTubePlayer video={v} />
      <figcaption className="flex flex-col gap-1 text-base">
        <span className="font-medium text-text">{v.title}</span>
        <span className="text-label text-text-muted">
          {v.channel} · <span className="font-mono text-code">{segmentLabel(v)}</span>
        </span>
        <span className="text-text-muted">{v.rationale}</span>
        <span className="text-label text-text-muted">You can complete this lesson without watching it.</span>
      </figcaption>
    </figure>
  );
}

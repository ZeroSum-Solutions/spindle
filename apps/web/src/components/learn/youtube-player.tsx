"use client";

import { useEffect, useId, useReducer, useRef, useState } from "react";
import { ExternalLink, Play, VideoOff } from "lucide-react";
import { embedSrc, IFRAME_API_URL, nextPlayerState, PRIVACY_URL, READY_TIMEOUT_MS, segmentLabel, TERMS_URL, watchUrl } from "@/lib/video/youtube";

/** The frozen segment plus the label the facade shows. */
export interface PlayerClip {
  videoId: string;
  startSeconds: number;
  endSeconds: number;
  title: string;
  channel: string;
}

// Click-to-load YouTube player (D-09). Before the click the page holds only our own
// placeholder: no thumbnail, no preconnect, no oEmbed, no YouTube script. Pressing
// play mounts the privacy-enhanced player frame, then loads the official IFrame API
// to learn whether the video actually plays; errors and a ready timeout end in a
// truthful "unavailable" state with a link to watch on YouTube.

interface YTPlayerOptions {
  events: { onReady?: () => void; onError?: (event: { data: number }) => void };
}
interface YTNamespace {
  Player: new (frame: HTMLIFrameElement, options: YTPlayerOptions) => unknown;
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

/** Loads the official IFrame API once per page. A failed load can be retried by a later mount. */
function loadIframeApi(): Promise<YTNamespace> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("YouTube IFrame API did not define a player"));
    };
    const script = document.createElement("script");
    script.src = IFRAME_API_URL;
    script.async = true;
    script.onerror = () => {
      apiPromise = null;
      script.remove();
      reject(new Error("YouTube IFrame API failed to load"));
    };
    document.head.appendChild(script);
  });
  return apiPromise;
}

export function YouTubePlayer({ video, gone = false, readyTimeoutMs = READY_TIMEOUT_MS }: { video: PlayerClip; gone?: boolean; readyTimeoutMs?: number }) {
  // A clip the provider already reports as unavailable starts in that state; nothing is offered to load.
  const [state, dispatch] = useReducer(nextPlayerState, gone ? "unavailable" : "idle");
  const [src, setSrc] = useState<string | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const noticeId = useId();

  useEffect(() => {
    const frame = frameRef.current;
    if (!src || !frame) return;
    let cancelled = false;
    frame.focus();
    const timer = window.setTimeout(() => dispatch("timeout"), readyTimeoutMs);
    loadIframeApi().then(
      (YT) => {
        if (cancelled) return;
        new YT.Player(frame, {
          events: {
            onReady: () => {
              window.clearTimeout(timer);
              if (!cancelled) dispatch("ready");
            },
            onError: () => {
              if (!cancelled) dispatch("error");
            },
          },
        });
      },
      () => {
        if (!cancelled) dispatch("script-failed");
      },
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [src, readyTimeoutMs]);

  if (state === "unavailable") {
    return (
      <div
        data-video="unavailable"
        role="status"
        className="flex min-h-[200px] w-full flex-col items-center justify-center gap-3 rounded-card border border-dashed border-control bg-surface-muted p-6 text-center"
      >
        <VideoOff aria-hidden strokeWidth={1.75} className="size-6 text-text-muted" />
        <p className="text-base text-text">This video is unavailable here right now.</p>
        <a
          href={watchUrl(video)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1.5 font-medium text-brand hover:text-brand-hover"
        >
          Watch on YouTube
          <ExternalLink aria-hidden strokeWidth={1.75} className="size-4" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </div>
    );
  }

  if (src) {
    return (
      <div className="flex flex-col gap-2">
        <div className="aspect-video min-h-[200px] w-full min-w-[200px] overflow-hidden rounded-card bg-ink">
          <iframe
            ref={frameRef}
            data-video="player"
            src={src}
            title={`YouTube video: ${video.title}`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin"
            className="h-full w-full border-0"
          />
        </div>
        <p aria-live="polite" className="text-label text-text-muted">
          {state === "loading" ? "Loading the YouTube player…" : ""}
        </p>
      </div>
    );
  }

  // The facade is our own ink panel: the clip's title, its range, the play control and
  // the YouTube notice. No thumbnail or other YouTube request before the click.
  return (
    <div
      data-video="facade"
      className="flex min-h-[200px] w-full flex-col justify-end gap-3 rounded-card bg-ink p-4 text-white [--focus-ring:var(--color-white)] sm:aspect-video md:p-6"
    >
      <div className="flex flex-col gap-1">
        <p className="text-base font-medium">{video.title}</p>
        <p className="text-label text-white/80">
          {video.channel} · <span className="font-mono text-code">{segmentLabel(video)}</span>
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          setSrc(embedSrc(video, window.location.origin));
          dispatch("activate");
        }}
        aria-describedby={noticeId}
        className="inline-flex min-h-12 items-center gap-2 self-start rounded-control bg-white px-5 font-medium text-ink transition-colors duration-[var(--duration-feedback)] hover:bg-surface-muted"
      >
        <Play aria-hidden strokeWidth={1.75} className="size-4" />
        Play video<span className="sr-only">: {video.title}</span>
      </button>
      <p id={noticeId} data-video="notice" className="text-label text-white/80">
        Plays from YouTube. Pressing play loads YouTube&apos;s player, which may collect data and store information on your device. See Google&apos;s{" "}
        <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="text-white underline underline-offset-2">
          privacy policy
        </a>{" "}
        and YouTube&apos;s{" "}
        <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" className="text-white underline underline-offset-2">
          terms
        </a>
        .
      </p>
    </div>
  );
}

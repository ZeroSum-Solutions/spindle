"use client";

import { useEffect, useId, useReducer, useRef, useState } from "react";
import { ExternalLink, Play, VideoOff } from "lucide-react";
import { embedSrc, IFRAME_API_URL, nextPlayerState, PRIVACY_URL, READY_TIMEOUT_MS, segmentLabel, TERMS_URL, watchUrl, type YouTubeVideo } from "@/lib/video/youtube";

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

export function YouTubePlayer({ video, readyTimeoutMs = READY_TIMEOUT_MS }: { video: YouTubeVideo; readyTimeoutMs?: number }) {
  const [state, dispatch] = useReducer(nextPlayerState, "idle");
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
        <p className="text-base text-text">This video is unavailable here right now. The YouTube player could not play it.</p>
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

  return (
    <div className="flex flex-col gap-2">
      <div
        data-video="facade"
        className="flex aspect-video min-h-[200px] w-full flex-col items-center justify-center gap-3 rounded-card border border-border bg-surface-muted p-4 text-center"
      >
        <button
          type="button"
          onClick={() => {
            setSrc(embedSrc(video, window.location.origin));
            dispatch("activate");
          }}
          aria-describedby={noticeId}
          className="inline-flex min-h-12 items-center gap-2 rounded-control border border-control bg-surface px-5 font-medium text-text transition-colors duration-[var(--duration-feedback)] hover:bg-surface-muted"
        >
          <Play aria-hidden strokeWidth={1.75} className="size-4" />
          Play video<span className="sr-only">: {video.title}</span>
        </button>
        <p className="font-mono text-code text-text-muted">{segmentLabel(video)}</p>
      </div>
      <p id={noticeId} data-video="notice" className="text-label text-text-muted">
        Plays from YouTube. Pressing play loads YouTube&apos;s player, which may collect data and store information on your device. See
        Google&apos;s{" "}
        <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="text-brand underline underline-offset-2 hover:text-brand-hover">
          privacy policy
        </a>{" "}
        and YouTube&apos;s{" "}
        <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" className="text-brand underline underline-offset-2 hover:text-brand-hover">
          terms
        </a>
        .
      </p>
    </div>
  );
}

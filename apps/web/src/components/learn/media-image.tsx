"use client";

import { useEffect, useRef, useState } from "react";
import { ImageOff } from "lucide-react";

/** A lesson image that admits failure: a refused or missing object shows the same placeholder as unavailable media. */
export function MediaImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // An image can fail before hydration attaches onError; check once on mount.
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth === 0) setFailed(true);
  }, []);
  if (failed) return <MediaUnavailable alt={alt} />;
  return (
    // Lesson media comes from storage or vetted https hosts, not the Next image optimizer.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="w-full rounded-card bg-surface-muted"
    />
  );
}

/** An https lesson video; a failed load shows the same placeholder as unavailable media. */
export function MediaVideo({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <MediaUnavailable alt={alt} kind="video" />;
  return (
    <video controls preload="none" aria-label={alt} onError={() => setFailed(true)} className="w-full rounded-card bg-surface-muted">
      <source src={src} onError={() => setFailed(true)} />
    </video>
  );
}

export function MediaUnavailable({ alt, kind = "image" }: { alt: string; kind?: "image" | "video" }) {
  return (
    <div
      data-media="unavailable"
      className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-card border border-dashed border-control bg-surface-muted p-6 text-center text-text-muted"
    >
      <ImageOff aria-hidden strokeWidth={1.75} className="size-6" />
      <p className="text-label">This {kind} is not available.</p>
      <p className="sr-only">{alt}</p>
    </div>
  );
}

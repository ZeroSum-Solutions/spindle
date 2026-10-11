import { boundedRecheck, RECHECK_TIMEOUT_MS } from "./youtube";

/** How often a mounted player asks the registry again whether its clip may still play. */
export const REVOCATION_INTERVAL_MS = 60_000;

export interface RevocationWatchOptions {
  /** The bound registry check (version_media for this version and clip). */
  recheck: (() => Promise<boolean>) | undefined;
  /** Called once, when a check fails, times out or answers anything but true. */
  onRevoke: () => void;
  intervalMs?: number;
  timeoutMs?: number;
  /** Fires "visibilitychange"; checked again whenever it becomes visible. */
  doc?: Pick<Document, "addEventListener" | "removeEventListener" | "visibilityState">;
  timers?: {
    every: (fn: () => void, ms: number) => unknown;
    cancel: (id: unknown) => void;
    set: (fn: () => void, ms: number) => unknown;
    clear: (id: unknown) => void;
  };
}

/**
 * Keeps asking the registry while a clip is mounted (ADR 0007: a failed or expired check stops
 * playback at once, like a disable). Checks every `intervalMs` and when the page becomes
 * visible again; one check at a time. The first non-true answer, error or timeout calls
 * `onRevoke` and stops the watch. Returns a stop function; nothing fires after it is called.
 */
export function watchRevocation({
  recheck,
  onRevoke,
  intervalMs = REVOCATION_INTERVAL_MS,
  timeoutMs = RECHECK_TIMEOUT_MS,
  doc = typeof document === "undefined" ? undefined : document,
  timers = {
    every: (fn, ms) => setInterval(fn, ms),
    cancel: (id) => clearInterval(id as ReturnType<typeof setInterval>),
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  },
}: RevocationWatchOptions): () => void {
  let stopped = false;
  let inFlight = false;
  const check = () => {
    if (stopped || inFlight) return;
    inFlight = true;
    void boundedRecheck(recheck, timeoutMs, { set: timers.set, clear: timers.clear }).then((allowed) => {
      inFlight = false;
      if (stopped || allowed) return;
      stop();
      onRevoke();
    });
  };
  const onVisibility = () => {
    if (doc?.visibilityState === "visible") check();
  };
  const interval = timers.every(check, intervalMs);
  doc?.addEventListener("visibilitychange", onVisibility);
  function stop() {
    if (stopped) return;
    stopped = true;
    timers.cancel(interval);
    doc?.removeEventListener("visibilitychange", onVisibility);
  }
  return stop;
}

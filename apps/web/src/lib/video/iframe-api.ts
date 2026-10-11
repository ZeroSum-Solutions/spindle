// Loads YouTube's official IFrame API once, on demand (after the learner presses play).
// Initialisation is bounded: a timeout or a script error rejects, clears the shared promise
// and removes the script, so a later mount can try again; a ready callback that arrives
// after the timeout is ignored. The window and document are injected so this is unit-tested.

export interface YTPlayerOptions {
  events: { onReady?: () => void; onError?: (event: { data: number }) => void };
}
export interface YTNamespace {
  Player: new (frame: HTMLIFrameElement, options: YTPlayerOptions) => unknown;
}

interface ApiWindow {
  YT?: YTNamespace;
  onYouTubeIframeAPIReady?: () => void;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}
interface ApiScript {
  id: string;
  src: string;
  async: boolean;
  onerror: (() => void) | null;
  remove: () => void;
}
interface ApiDocument {
  createElement: (tag: "script") => ApiScript;
  getElementById: (id: string) => { remove: () => void } | null;
  head: { appendChild: (node: ApiScript) => unknown };
}

const SCRIPT_ID = "spindle-youtube-iframe-api";

export function createIframeApiLoader({ win, doc, url, timeoutMs }: { win: ApiWindow; doc: ApiDocument; url: string; timeoutMs: number }) {
  let pending: Promise<YTNamespace> | null = null;

  return function load(): Promise<YTNamespace> {
    if (win.YT?.Player) return Promise.resolve(win.YT);
    if (pending) return pending;
    const attempt = new Promise<YTNamespace>((resolve, reject) => {
      let settled = false;
      const finish = (outcome: () => void) => {
        if (settled) return;
        settled = true;
        win.clearTimeout(timer);
        outcome();
      };
      const previous = win.onYouTubeIframeAPIReady;
      win.onYouTubeIframeAPIReady = () => {
        try {
          previous?.();
        } finally {
          finish(() => (win.YT?.Player ? resolve(win.YT) : reject(new Error("YouTube IFrame API did not define a player"))));
        }
      };
      const script = doc.createElement("script");
      script.id = SCRIPT_ID;
      script.src = url;
      script.async = true;
      script.onerror = () => finish(() => reject(new Error("YouTube IFrame API failed to load")));
      const timer = win.setTimeout(() => finish(() => reject(new Error("YouTube IFrame API did not become ready in time"))), timeoutMs);
      doc.head.appendChild(script);
    });
    pending = attempt;
    attempt.catch(() => {
      if (pending === attempt) pending = null;
      doc.getElementById(SCRIPT_ID)?.remove();
    });
    return attempt;
  };
}

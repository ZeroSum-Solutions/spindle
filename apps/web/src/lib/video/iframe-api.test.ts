import { describe, expect, it } from "vitest";
import { createIframeApiLoader, type YTNamespace } from "./iframe-api";

/** A fake window and document with a manual clock. */
function harness() {
  const timers: { at: number; fn: () => void; id: number }[] = [];
  let now = 0;
  let ids = 0;
  const scripts: { id: string; src: string; async: boolean; onerror: (() => void) | null; removed: boolean; remove: () => void }[] = [];
  const win: Parameters<typeof createIframeApiLoader>[0]["win"] = {
    setTimeout: (fn, ms) => {
      const id = ++ids;
      timers.push({ at: now + ms, fn, id });
      return id;
    },
    clearTimeout: (handle) => {
      const i = timers.findIndex((t) => t.id === handle);
      if (i >= 0) timers.splice(i, 1);
    },
  };
  const doc: Parameters<typeof createIframeApiLoader>[0]["doc"] = {
    createElement: () => {
      const s = { id: "", src: "", async: false, onerror: null as (() => void) | null, removed: false, remove: () => (s.removed = true) };
      return s;
    },
    getElementById: (id) => [...scripts].reverse().find((s) => s.id === id && !s.removed) ?? null,
    head: { appendChild: (node) => scripts.push(node as (typeof scripts)[number]) },
  };
  const advance = (ms: number) => {
    now += ms;
    for (const t of [...timers].filter((t) => t.at <= now)) {
      timers.splice(timers.indexOf(t), 1);
      t.fn();
    }
  };
  const load = createIframeApiLoader({ win, doc, url: "https://www.youtube.com/iframe_api", timeoutMs: 1000 });
  const yt = { Player: function Player() {} } as unknown as YTNamespace;
  return { win, scripts, advance, load, yt };
}

describe("createIframeApiLoader", () => {
  it("loads once and shares the result", async () => {
    const h = harness();
    const a = h.load();
    const b = h.load();
    expect(a).toBe(b);
    expect(h.scripts).toHaveLength(1);
    h.win.YT = h.yt;
    h.win.onYouTubeIframeAPIReady!();
    await expect(a).resolves.toBe(h.yt);
    await expect(h.load()).resolves.toBe(h.yt);
    expect(h.scripts).toHaveLength(1);
  });

  it("times out when the API never becomes ready, then lets a later mount retry", async () => {
    const h = harness();
    const first = h.load();
    h.advance(1000);
    await expect(first).rejects.toThrow(/in time/);
    await Promise.resolve();
    expect(h.scripts[0]!.removed).toBe(true);
    const second = h.load();
    expect(second).not.toBe(first);
    expect(h.scripts).toHaveLength(2);
    h.win.YT = h.yt;
    h.win.onYouTubeIframeAPIReady!();
    await expect(second).resolves.toBe(h.yt);
  });

  it("ignores a ready callback that arrives after the timeout", async () => {
    const h = harness();
    const first = h.load();
    const staleReady = h.win.onYouTubeIframeAPIReady!;
    h.advance(1000);
    await expect(first).rejects.toThrow();
    h.win.YT = undefined;
    expect(() => staleReady()).not.toThrow();
    await expect(first).rejects.toThrow(/in time/);
  });

  it("clears a failed script load so the next mount retries", async () => {
    const h = harness();
    const first = h.load();
    h.scripts[0]!.onerror!();
    await expect(first).rejects.toThrow(/failed to load/);
    await Promise.resolve();
    expect(h.load()).not.toBe(first);
  });

  it("rejects when the API reports ready without a player", async () => {
    const h = harness();
    const first = h.load();
    h.win.onYouTubeIframeAPIReady!();
    await expect(first).rejects.toThrow(/did not define a player/);
  });
});

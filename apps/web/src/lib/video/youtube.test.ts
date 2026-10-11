import { afterEach, describe, expect, it, vi } from "vitest";
import type { MediaAvailability } from "@spindle/schema";
import { boundedRecheck, clipLabels, clipState, embedSrc, nextPlayerState, PLAYER_ORIGIN, segmentLabel, watchUrl, type PlayerEvent, type PlayerState } from "./youtube";

const SEGMENT = { videoId: "abcDEF12_-9", startSeconds: 65, endSeconds: 150 };
const playable: MediaAvailability = { mediaId: "m1", state: "playable", review: "model-described", title: "Synthetic clip", channel: "Synthetic channel", available: true };

describe("embedSrc", () => {
  it("uses the privacy-enhanced host with the frozen segment and the page origin", () => {
    const url = new URL(embedSrc(SEGMENT, "http://127.0.0.1:3100/gyms/a/learn"));
    expect(url.origin).toBe(PLAYER_ORIGIN);
    expect(url.pathname).toBe("/embed/abcDEF12_-9");
    expect(url.searchParams.get("start")).toBe("65");
    expect(url.searchParams.get("end")).toBe("150");
    expect(url.searchParams.get("enablejsapi")).toBe("1");
    expect(url.searchParams.get("origin")).toBe("http://127.0.0.1:3100");
    // Official controls stay: nothing turns them off or hides branding.
    expect(url.searchParams.has("controls")).toBe(false);
    expect(url.searchParams.has("modestbranding")).toBe(false);
  });

  it("refuses an id that is not a YouTube id", () => {
    expect(() => embedSrc({ ...SEGMENT, videoId: "../../evil" }, "https://spindle.example")).toThrow();
  });
});

describe("watchUrl and segmentLabel", () => {
  it("links to the segment start on YouTube", () => {
    expect(watchUrl(SEGMENT)).toBe("https://www.youtube.com/watch?v=abcDEF12_-9&t=65s");
    expect(watchUrl({ ...SEGMENT, startSeconds: 0 })).toBe("https://www.youtube.com/watch?v=abcDEF12_-9");
  });

  it("labels the segment", () => {
    expect(segmentLabel(SEGMENT)).toBe("1:05 to 2:30");
  });
});

describe("clipState", () => {
  it("offers only clips the registry reports as playable", () => {
    expect(clipState(playable)).toBe("playable");
    expect(clipState({ ...playable, title: null, channel: null, available: null })).toBe("playable");
  });

  it("fails closed when the registry did not report the clip or disabled it", () => {
    expect(clipState(undefined)).toBe("off");
    expect(clipState({ ...playable, state: "disabled" })).toBe("off");
    expect(clipState({ ...playable, state: "disabled", available: true })).toBe("off");
  });

  it("says a clip the provider reports as unavailable is gone", () => {
    expect(clipState({ ...playable, available: false })).toBe("gone");
  });

  it("falls back to neutral labels without fresh provider data", () => {
    expect(clipLabels({ ...playable, title: null, channel: null })).toEqual({ title: "Coaching video", channel: "YouTube" });
    expect(clipLabels(playable)).toEqual({ title: "Synthetic clip", channel: "Synthetic channel" });
  });
});

describe("nextPlayerState", () => {
  const cases: [PlayerState, PlayerEvent, PlayerState][] = [
    ["idle", "activate", "loading"],
    ["idle", "ready", "idle"],
    ["idle", "error", "idle"],
    ["loading", "ready", "ready"],
    ["loading", "error", "unavailable"],
    ["loading", "timeout", "unavailable"],
    ["loading", "script-failed", "unavailable"],
    ["loading", "activate", "loading"],
    ["ready", "timeout", "ready"],
    ["ready", "error", "unavailable"],
    ["unavailable", "ready", "unavailable"],
    ["unavailable", "activate", "unavailable"],
    ["loading", "blocked", "blocked"],
    ["idle", "blocked", "idle"],
    ["ready", "blocked", "blocked"],
    ["blocked", "activate", "blocked"],
    ["blocked", "ready", "blocked"],
  ];
  it.each(cases)("%s + %s -> %s", (state, event, expected) => {
    expect(nextPlayerState(state, event)).toBe(expected);
  });
});

describe("boundedRecheck", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fails closed when the check never answers, and ignores a late answer", async () => {
    vi.useFakeTimers();
    let answer: (v: boolean) => void = () => {};
    const result = boundedRecheck(() => new Promise<boolean>((r) => (answer = r)), 1000);
    await vi.advanceTimersByTimeAsync(1000);
    answer(true);
    await expect(result).resolves.toBe(false);
  });

  it("never resolves on its own without the deadline: a hung check is bounded", async () => {
    vi.useFakeTimers();
    let settled = false;
    const result = boundedRecheck(() => new Promise<boolean>(() => {}), 1000).then((v) => {
      settled = true;
      return v;
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe(false);
  });

  it("allows play only on an in-time true", async () => {
    await expect(boundedRecheck(async () => true, 1000)).resolves.toBe(true);
    await expect(boundedRecheck(async () => false, 1000)).resolves.toBe(false);
    await expect(boundedRecheck(() => Promise.reject(new Error("synthetic")), 1000)).resolves.toBe(false);
    await expect(
      boundedRecheck(() => {
        throw new Error("synthetic");
      }, 1000),
    ).resolves.toBe(false);
    await expect(boundedRecheck(undefined, 1000)).resolves.toBe(false);
  });
});

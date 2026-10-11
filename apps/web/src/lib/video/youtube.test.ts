import { describe, expect, it } from "vitest";
import { embedSrc, nextPlayerState, PLAYER_ORIGIN, segmentLabel, watchUrl, youTubeVideoSchema, type PlayerEvent, type PlayerState } from "./youtube";

const VIDEO = { videoId: "abcDEF12_-9", start: 65, end: 150, title: "Synthetic clip", channel: "Synthetic channel", rationale: "Shows the set-up." };

describe("youTubeVideoSchema", () => {
  it("accepts a segment", () => {
    expect(youTubeVideoSchema.parse(VIDEO)).toEqual(VIDEO);
    expect(youTubeVideoSchema.parse({ ...VIDEO, start: 0, end: undefined }).end).toBeUndefined();
  });

  it.each([
    ["short id", { videoId: "abc" }],
    ["long id", { videoId: "abcDEF12_-9x" }],
    ["url as id", { videoId: "https://youtu.be/abcDEF12_-9" }],
    ["path characters", { videoId: "abc/../ef12" }],
    ["query characters", { videoId: "abcDEF12?a=" }],
    ["negative start", { start: -1 }],
    ["fractional start", { start: 1.5 }],
    ["end before start", { end: 65 }],
    ["empty title", { title: "  " }],
    ["empty rationale", { rationale: "" }],
  ])("rejects %s", (_, patch) => {
    expect(youTubeVideoSchema.safeParse({ ...VIDEO, ...patch }).success).toBe(false);
  });

  it("rejects unknown keys such as a thumbnail", () => {
    expect(youTubeVideoSchema.safeParse({ ...VIDEO, thumbnail: "https://i.ytimg.com/x.jpg" }).success).toBe(false);
  });
});

describe("embedSrc", () => {
  it("uses the privacy-enhanced host with the segment and the page origin", () => {
    const url = new URL(embedSrc(VIDEO, "http://127.0.0.1:3100/gyms/a/learn"));
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

  it("omits end when the segment runs to the end", () => {
    expect(new URL(embedSrc({ ...VIDEO, end: undefined }, "https://spindle.example")).searchParams.has("end")).toBe(false);
  });

  it("refuses an id that skipped validation", () => {
    expect(() => embedSrc({ ...VIDEO, videoId: "../../evil" }, "https://spindle.example")).toThrow();
  });
});

describe("watchUrl and segmentLabel", () => {
  it("links to the segment start on YouTube", () => {
    expect(watchUrl(VIDEO)).toBe("https://www.youtube.com/watch?v=abcDEF12_-9&t=65s");
    expect(watchUrl({ ...VIDEO, start: 0 })).toBe("https://www.youtube.com/watch?v=abcDEF12_-9");
  });

  it("labels the segment", () => {
    expect(segmentLabel(VIDEO)).toBe("1:05 to 2:30");
    expect(segmentLabel({ start: 0, end: undefined })).toBe("From 0:00");
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
  ];
  it.each(cases)("%s + %s -> %s", (state, event, expected) => {
    expect(nextPlayerState(state, event)).toBe(expected);
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MediaAvailability, VideoSegment } from "@spindle/schema";
import { YouTubeSegment } from "./youtube-segment";

const segment = { mediaId: "m1", provider: "youtube", videoId: "abcDEF12_-9", startSeconds: 30, endSeconds: 95, rationale: "Synthetic rationale.", caption: "" } as VideoSegment;
const render = (availability: MediaAvailability) => renderToStaticMarkup(createElement(YouTubeSegment, { segment, availability, recheck: async () => false }));

describe("YouTubeSegment review status (D-11)", () => {
  it("says a playable clip was described by a model and is not yet human-checked", () => {
    const html = render({ mediaId: "m1", state: "playable", review: "model-described", title: "Synthetic", channel: "Synthetic", available: true });
    expect(html).toContain('data-review="model-described"');
    expect(html).toContain("Clip described by a model; human check pending");
    // Never a claim that a person checked it.
    expect(html).not.toMatch(/human[- ]checked|reviewed by a (person|human|coach|PT)/i);
  });

  it("says nothing about review when the registry reports none", () => {
    const html = render({ mediaId: "m1", state: "disabled", review: null, title: null, channel: null, available: null });
    expect(html).not.toContain("data-review");
  });
});

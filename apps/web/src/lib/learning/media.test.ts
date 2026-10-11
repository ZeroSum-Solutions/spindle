import { describe, expect, it } from "vitest";
import { isVideoType, resolveContentUrl, resolveMediaUrl, SERVABLE_MEDIA, storageObjectFor } from "./media";

const GYM = "00000000-0000-4000-8000-000000000500";
const OTHER = "00000000-0000-4000-8000-000000000501";

describe("storageObjectFor", () => {
  it("maps gym and global media paths", () => {
    expect(storageObjectFor(["org", GYM, "img", "a.png"])).toEqual({ bucket: "org-media", name: `${GYM}/img/a.png` });
    expect(storageObjectFor(["content", "shoulder", "a.webp"])).toEqual({ bucket: "content-media", name: "shoulder/a.webp" });
  });

  it.each([
    [[]],
    [["org"]],
    [["org", GYM]],
    [["org", "not-a-uuid", "a.png"]],
    [["org", "ABCDEF00-0000-4000-8000-000000000500", "a.png"]],
    [["content"]],
    [["content", "..", "a.png"]],
    [["content", ".", "a.png"]],
    [["content", "a%2e.png"]],
    [["content", "a b.png"]],
    [["content", ""]],
    [["public", "a.png"]],
    [["org-media", GYM, "a.png"]],
  ])("refuses %j", (segments) => {
    expect(storageObjectFor(segments)).toBeNull();
  });
});

describe("resolveContentUrl", () => {
  it("passes https through as external", () => {
    expect(resolveContentUrl("https://example.org/a.png", { orgId: null })).toEqual({ kind: "external", url: "https://example.org/a.png" });
  });

  it("allows global media for any content and gym media only for the owning gym", () => {
    expect(resolveContentUrl("/media/content/a.png", { orgId: null }).kind).toBe("media");
    expect(resolveContentUrl("/media/content/a.png", { orgId: GYM }).kind).toBe("media");
    expect(resolveContentUrl(`/media/org/${GYM}/a.png`, { orgId: GYM }).kind).toBe("media");
    expect(resolveContentUrl(`/media/org/${OTHER}/a.png`, { orgId: GYM }).kind).toBe("unavailable");
    expect(resolveContentUrl(`/media/org/${GYM}/a.png`, { orgId: null }).kind).toBe("unavailable");
  });

  it.each(["/images/a.png", "/media/content/../x.png", "/media/org/x/a.png", "http://example.org/a.png", "javascript:alert(1)", "data:image/png;base64,AA"])(
    "marks %s unavailable",
    (src) => {
      expect(resolveContentUrl(src, { orgId: GYM })).toEqual({ kind: "unavailable" });
    },
  );
});

describe("legacy video-host media (ADR 0007)", () => {
  it.each(["https://i.ytimg.com/vi/AbCdEfGhIj0/0.jpg", "https://www.youtube.com/watch?v=AbCdEfGhIj0", "https://youtu.be/AbCdEfGhIj0", "https://www.youtube-nocookie.com/embed/x"])(
    "renders %s as unavailable media, so nothing loads from YouTube",
    (src) => {
      expect(resolveMediaUrl(src, { orgId: null })).toEqual({ kind: "unavailable" });
    },
  );

  it("keeps a YouTube resource link as an ordinary external link (a click, not a load)", () => {
    expect(resolveContentUrl("https://www.youtube.com/watch?v=AbCdEfGhIj0", { orgId: null })).toEqual({
      kind: "external",
      url: "https://www.youtube.com/watch?v=AbCdEfGhIj0",
    });
  });

  it("resolves ordinary media exactly as content links", () => {
    for (const src of ["https://cdn.example.org/a.png", "/media/content/a.png", "/elsewhere/a.png"]) {
      expect(resolveMediaUrl(src, { orgId: null })).toEqual(resolveContentUrl(src, { orgId: null }));
    }
  });
});

describe("SERVABLE_MEDIA", () => {
  it.each(["image/png", "image/webp", "application/pdf"])("serves %s", (type) => expect(SERVABLE_MEDIA.test(type)).toBe(true));
  it.each(["video/mp4", "image/svg+xml", "text/html", "application/octet-stream", "image/png; charset=x", ""])("refuses %s", (type) =>
    expect(SERVABLE_MEDIA.test(type)).toBe(false),
  );
});

describe("isVideoType", () => {
  it.each(["video/mp4", "video/webm", "VIDEO/MP4", "video/mp4; codecs=avc1"])("redirects %s", (type) => expect(isVideoType(type)).toBe(true));
  it.each(["image/png", "video/quicktime", "application/mp4", "", undefined])("does not redirect %s", (type) => expect(isVideoType(type)).toBe(false));
});

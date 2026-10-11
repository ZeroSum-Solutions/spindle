import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "../csp";
import { renderableMediaUrl } from "./media";

const GYM = "00000000-0000-4000-8000-000000000500";

describe("renderableMediaUrl", () => {
  it("renders same-origin Storage media for its owner", () => {
    expect(renderableMediaUrl("/media/content/shoulder/a.png", { orgId: null })).toEqual({ kind: "media", url: "/media/content/shoulder/a.png" });
    expect(renderableMediaUrl(`/media/org/${GYM}/a.png`, { orgId: GYM }).kind).toBe("media");
  });

  it.each(["https://example.org/a.png", "https://cdn.example.com/clip.mp4", "https://www.youtube.com/watch?v=abcDEF12_-9", "http://example.org/a.png", "data:image/png;base64,AAAA"])(
    "never renders %s as lesson media, so the CSP and the renderer agree",
    (src) => {
      expect(renderableMediaUrl(src, { orgId: null }).kind).toBe("unavailable");
    },
  );

  it("matches a CSP that allows images only from self, blob and data, and video only from self and Storage", () => {
    const csp = contentSecurityPolicy({ dev: false, supabaseUrl: "https://abc.supabase.co" });
    expect(csp).toContain("img-src 'self' blob: data:;");
    expect(csp).toContain("media-src 'self' https://abc.supabase.co;");
  });
});

import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "./csp";

function parse(policy: string): Map<string, string[]> {
  return new Map(policy.split("; ").map((d) => {
    const [name, ...values] = d.split(" ");
    return [name!, values];
  }));
}

describe("contentSecurityPolicy", () => {
  const prod = parse(contentSecurityPolicy({ dev: false, supabaseUrl: "https://abc.supabase.co/" }));

  it("frames only the privacy-enhanced YouTube player", () => {
    expect(prod.get("frame-src")).toEqual(["https://www.youtube-nocookie.com"]);
    expect(prod.get("frame-ancestors")).toEqual(["'none'"]);
  });

  it("allows only our scripts plus the YouTube IFrame API loader and widget path", () => {
    const third = prod.get("script-src")!.filter((s) => s.startsWith("http"));
    expect(third).toEqual(["https://www.youtube.com/iframe_api", "https://www.youtube.com/s/player/"]);
    expect(prod.get("script-src")).not.toContain("'unsafe-eval'");
  });

  it("names no other third-party origin and no wildcard", () => {
    const all = [...prod.values()].flat();
    expect(all.filter((v) => v.includes("*"))).toEqual([]);
    expect(all.some((v) => /ytimg|googlevideo|doubleclick|google\.com/.test(v))).toBe(false);
    expect(prod.get("img-src")).toEqual(["'self'", "blob:", "data:"]);
    expect(prod.get("connect-src")).toEqual(["'self'"]);
  });

  it("lets stored video play from the Supabase origin only", () => {
    expect(prod.get("media-src")).toEqual(["'self'", "https://abc.supabase.co"]);
    expect(parse(contentSecurityPolicy({ dev: false })).get("media-src")).toEqual(["'self'"]);
    expect(parse(contentSecurityPolicy({ dev: false, supabaseUrl: "javascript:alert(1)" })).get("media-src")).toEqual(["'self'"]);
  });

  it("adds eval only in development", () => {
    expect(parse(contentSecurityPolicy({ dev: true })).get("script-src")).toContain("'unsafe-eval'");
  });
});

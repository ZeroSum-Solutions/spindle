import { describe, expect, it } from "vitest";
import { doiHref } from "./links";

describe("doiHref", () => {
  it("keeps an ordinary DOI readable", () => {
    expect(doiHref("10.1249/mss.0000000000001234")).toBe("https://doi.org/10.1249/mss.0000000000001234");
  });

  it.each([
    ["10.1002/(sici)1097-4636#x", "https://doi.org/10.1002/(sici)1097-4636%23x"],
    ["10.5555/a?b=c", "https://doi.org/10.5555/a%3Fb%3Dc"],
    ["10.5555/a/b c", "https://doi.org/10.5555/a/b%20c"],
  ])("encodes %s so the whole DOI stays in the path", (doi, href) => {
    expect(doiHref(doi)).toBe(href);
    const url = new URL(doiHref(doi));
    expect(url.search).toBe("");
    expect(url.hash).toBe("");
    expect(decodeURIComponent(url.pathname.slice(1))).toBe(doi);
  });
});

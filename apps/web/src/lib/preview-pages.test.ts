import { describe, expect, it } from "vitest";
import { canonicalPath, isPublisherPath, isTestOnlyPath, previewPagesEnabled } from "./preview-pages";

describe("previewPagesEnabled", () => {
  it("is off in a production build unless the test server turns it on", () => {
    expect(previewPagesEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(previewPagesEnabled({ NODE_ENV: "production", SPINDLE_PREVIEW_PAGES: "true" })).toBe(false);
    expect(previewPagesEnabled({ NODE_ENV: "production", SPINDLE_PREVIEW_PAGES: "1" })).toBe(true);
    expect(previewPagesEnabled({ NODE_ENV: "development" })).toBe(true);
    expect(previewPagesEnabled({ NODE_ENV: "test" })).toBe(true);
  });
});

describe("canonicalPath and isTestOnlyPath", () => {
  it.each([
    "/brand-preview",
    "/%62rand-preview",
    "/brand%2dpreview",
    "/brand%2Dpreview",
    "/%2562rand-preview",
    "/Brand-Preview",
    "/brand-preview/",
    "//brand-preview",
    "/x/../brand-preview",
    "/./brand-preview",
    "/x/%2e%2e/brand-preview",
    "/\\brand-preview",
    "/brand-preview.rsc",
  ])("%s reaches the brand preview", (path) => {
    expect(isTestOnlyPath(path)).toBe(true);
  });

  it.each(["/", "/design", "/brand-previews", "/coaches", "/%E0%A4%A"])("%s does not", (path) => {
    expect(isTestOnlyPath(path)).toBe(false);
  });

  it("collapses slashes and dot segments", () => {
    expect(canonicalPath("//a/./b/../c/")).toBe("/a/c");
    expect(canonicalPath("/../..")).toBe("/");
  });
});

describe("isPublisherPath", () => {
  it.each(["/publisher/tenant-texts", "/%70ublisher/tenant-texts", "//publisher/tenant-texts/", "/x/../publisher", "/Publisher/Tenant-Texts", "/publisher.rsc"])("%s is publisher-only", (p) => {
    expect(isPublisherPath(p)).toBe(true);
  });
  it.each(["/", "/gyms", "/publishers", "/gyms/publisher"])("%s is not", (p) => {
    expect(isPublisherPath(p)).toBe(false);
  });
});

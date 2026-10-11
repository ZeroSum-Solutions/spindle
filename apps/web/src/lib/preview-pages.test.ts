import { describe, expect, it } from "vitest";
import { previewPagesEnabled } from "./preview-pages";

describe("previewPagesEnabled", () => {
  it("is off in a production build unless the test server turns it on", () => {
    expect(previewPagesEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(previewPagesEnabled({ NODE_ENV: "production", SPINDLE_PREVIEW_PAGES: "true" })).toBe(false);
    expect(previewPagesEnabled({ NODE_ENV: "production", SPINDLE_PREVIEW_PAGES: "1" })).toBe(true);
    expect(previewPagesEnabled({ NODE_ENV: "development" })).toBe(true);
    expect(previewPagesEnabled({ NODE_ENV: "test" })).toBe(true);
  });
});

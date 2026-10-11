/**
 * Test-only pages (the brand preview) answer 404 unless the server was started for development
 * or with SPINDLE_PREVIEW_PAGES=1, which only the Playwright web server sets. Read at request time.
 */
export function previewPagesEnabled(env: Readonly<Record<string, string | undefined>>): boolean {
  return env.NODE_ENV !== "production" || env.SPINDLE_PREVIEW_PAGES === "1";
}

/** Pages that only the test server serves. The proxy answers 404 for them otherwise. */
export const TEST_ONLY_PAGES: readonly string[] = ["/brand-preview"];

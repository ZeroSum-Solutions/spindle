/**
 * Test-only pages (the brand preview) answer 404 unless the server was started for development
 * or with SPINDLE_PREVIEW_PAGES=1, which only the Playwright web server sets. Read at request time.
 */
export function previewPagesEnabled(env: Readonly<Record<string, string | undefined>>): boolean {
  return env.NODE_ENV !== "production" || env.SPINDLE_PREVIEW_PAGES === "1";
}

/** Pages that only the test server serves. The proxy answers 404 for them otherwise. */
export const TEST_ONLY_PAGES: readonly string[] = ["/brand-preview"];

/**
 * The path a request would route to, in one canonical form: percent-decoded (repeatedly, so a
 * double-encoded path cannot slip through), backslashes as slashes, repeated slashes collapsed,
 * dot segments resolved, no trailing slash, lower case. A path that cannot be decoded is compared
 * in its last decodable form.
 */
export function canonicalPath(pathname: string): string {
  let path = pathname;
  for (let i = 0; i < 4; i += 1) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(path);
    } catch {
      break;
    }
    if (decoded === path) break;
    path = decoded;
  }
  const out: string[] = [];
  for (const segment of path.replace(/\\/g, "/").split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") out.pop();
    else out.push(segment);
  }
  return `/${out.join("/")}`.toLowerCase();
}

/**
 * True when a request path reaches a test-only page, in any spelling: the page itself, anything
 * below it, or a suffixed variant such as an RSC payload (`/brand-preview.rsc`).
 */
export function isTestOnlyPath(pathname: string): boolean {
  const path = canonicalPath(pathname);
  return TEST_ONLY_PAGES.some((page) => path === page || path.startsWith(`${page}/`) || path.startsWith(`${page}.`));
}

/** Publisher-only pages (the admission screen). The proxy answers 404 unless the caller is a content publisher. */
export const PUBLISHER_PAGES: readonly string[] = ["/publisher"];

/** True when a request path reaches a publisher-only page, in any spelling (canonical, as for test-only pages). */
export function isPublisherPath(pathname: string): boolean {
  const path = canonicalPath(pathname);
  return PUBLISHER_PAGES.some((page) => path === page || path.startsWith(`${page}/`) || path.startsWith(`${page}.`));
}

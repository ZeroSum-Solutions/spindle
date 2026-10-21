import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isTestOnlyPath, previewPagesEnabled } from "./lib/preview-pages";
import { learnGymSlug } from "./lib/learn-path";
import { slugSchema } from "./lib/forms";

const PROTECTED = ["/gyms"];

/** Refreshes the Supabase session cookie and keeps signed-out users out of /gyms. */
export async function proxy(request: NextRequest) {
  // Test-only pages are a real 404 (status and body) unless this server was started for tests.
  // The path is canonicalized first, so encoded, doubled-slash or dot-segment spellings match too.
  if (isTestOnlyPath(request.nextUrl.pathname) && !previewPagesEnabled(process.env)) {
    return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  let response = NextResponse.next({ request });
  let pendingCookies: { name: string; value: string; options: object }[] = [];
  let pendingHeaders: Record<string, string> = {};

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet, headers) => {
          for (const { name, value } of toSet) request.cookies.set(name, value);
          pendingCookies = toSet;
          pendingHeaders = headers ?? {};
          response = NextResponse.next({ request });
          apply(response, pendingCookies, pendingHeaders);
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const path = request.nextUrl.pathname;
  const learnSlug = learnGymSlug(path);
  if (!signedIn && (learnSlug !== null || PROTECTED.some((prefix) => path === prefix || path.startsWith(`${prefix}/`)))) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = `?next=${encodeURIComponent(path)}`;
    // Keep cookie updates (e.g. clearing an invalid session) on the redirect too.
    return apply(NextResponse.redirect(url), pendingCookies, pendingHeaders);
  }
  // Learner pages stream, so a notFound() in the page arrives after a 200. Answer a real 404 here
  // for anyone who is not a member of the route gym: the same RLS-protected orgs read as
  // learnerGym(), which only returns the caller's own gyms. Fails closed; the pages repeat the check.
  if (learnSlug !== null && !(await isMemberOf(supabase, learnSlug))) {
    return apply(new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } }), pendingCookies, pendingHeaders);
  }
  if (path.startsWith("/invite/")) {
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("Cache-Control", "no-store");
  }
  return response;
}

/** True only when the signed-in caller can read the gym's row; any error counts as no. */
async function isMemberOf(supabase: ReturnType<typeof createServerClient>, rawSlug: string): Promise<boolean> {
  const slug = slugSchema.safeParse(rawSlug);
  if (!slug.success) return false;
  try {
    const { data, error } = await supabase.from("orgs").select("id").eq("slug", slug.data).maybeSingle();
    return !error && data !== null;
  } catch {
    return false;
  }
}

function apply(
  response: NextResponse,
  cookies: { name: string; value: string; options: object }[],
  headers: Record<string, string>,
): NextResponse {
  for (const { name, value, options } of cookies) response.cookies.set(name, value, options);
  for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
  return response;
}

// Image files are skipped only where the static assets live (the root and /brand/), so a route
// parameter that ends in an image extension (/gyms/<slug>/learn/<id>/figure.png) still runs the proxy.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|(?:brand/)?[^/]*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};

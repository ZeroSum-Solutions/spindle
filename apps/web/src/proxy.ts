import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPublisherPath, isTestOnlyPath, previewPagesEnabled } from "./lib/preview-pages";

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
  // Publisher-only pages are a real 404 (status and body) for everyone who is not a content
  // publisher, signed in or not. The page repeats the check at request time.
  if (isPublisherPath(path)) {
    const { data: isPublisher, error } = signedIn ? await supabase.rpc("is_content_publisher") : { data: false, error: null };
    if (error || isPublisher !== true) {
      return apply(new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } }), pendingCookies, pendingHeaders);
    }
    response.headers.set("Cache-Control", "no-store");
  }
  if (!signedIn && PROTECTED.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = `?next=${encodeURIComponent(path)}`;
    // Keep cookie updates (e.g. clearing an invalid session) on the redirect too.
    return apply(NextResponse.redirect(url), pendingCookies, pendingHeaders);
  }
  if (path.startsWith("/invite/")) {
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("Cache-Control", "no-store");
  }
  return response;
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

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};

import type { NextRequest } from "next/server";
import { isVideoObject, SERVABLE_MEDIA, storageObjectFor, VIDEO_URL_SECONDS } from "@/lib/learning/media";
import { createClient, currentUser } from "@/lib/supabase/server";

// Lesson media from private storage, read as the signed-in user so Storage RLS
// decides: gym media for members of that gym, global media for any signed-in
// user. The proxy skips image-like paths, so this handler checks the session
// itself. Every refusal is the same uncached 404, so it says nothing about
// whether an object exists. No service key is used. Video is the one redirect: the
// user's client signs a URL that lives at most a minute, so Storage can serve the
// byte ranges players need.

const PRIVATE = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } as const;

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { ...PRIVATE, "Content-Type": "text/plain; charset=utf-8" } });
}

export async function GET(_request: NextRequest, ctx: RouteContext<"/media/[...path]">) {
  const { path } = await ctx.params;
  const object = storageObjectFor(path);
  if (!object) return notFound();
  if (!(await currentUser())) return notFound();
  const supabase = await createClient();
  if (isVideoObject(object.name)) {
    const { data: signed, error } = await supabase.storage.from(object.bucket).createSignedUrl(object.name, VIDEO_URL_SECONDS);
    if (error || !signed?.signedUrl) return notFound();
    return new Response(null, { status: 302, headers: { ...PRIVATE, Location: signed.signedUrl, "Referrer-Policy": "no-referrer" } });
  }
  const { data, error } = await supabase.storage.from(object.bucket).download(object.name);
  if (error || !data) return notFound();
  const type = data.type.toLowerCase();
  if (!SERVABLE_MEDIA.test(type)) return notFound();
  return new Response(data.stream(), {
    headers: {
      ...PRIVATE,
      "Content-Type": type,
      "Content-Length": String(data.size),
      "Content-Disposition": type === "application/pdf" ? "attachment" : "inline",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}

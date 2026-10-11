// Reads and edits the @supabase/ssr session cookie in a Playwright context.
// Tokens never leave this module except as sha256 hashes; nothing is printed.
import { createHash } from "node:crypto";
import type { BrowserContext, Cookie } from "@playwright/test";
import { combineChunks, createChunks, stringFromBase64URL, stringToBase64URL } from "@supabase/ssr";

const AUTH_COOKIE = /^sb-[^.]+-auth-token(?:\.\d+)?$/;
const PREFIX = "base64-";

export type StoredSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  [key: string]: unknown;
};

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** The decoded claims of a JWT (not verified; the server verifies). */
export function jwtClaims(token: string): { sub: string; session_id: string; iat: number; exp: number } {
  return JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8"));
}

/** The session cookie chunks and the session they hold. */
export async function readSession(context: BrowserContext): Promise<{ key: string; cookies: Cookie[]; session: StoredSession }> {
  const cookies = (await context.cookies()).filter((c) => AUTH_COOKIE.test(c.name));
  if (cookies.length === 0) throw new Error("no auth cookie");
  const key = cookies[0]!.name.replace(/\.\d+$/, "");
  const raw = await combineChunks(key, (name) => cookies.find((c) => c.name === name)?.value ?? null);
  if (!raw?.startsWith(PREFIX)) throw new Error("unexpected auth cookie encoding");
  return { key, cookies, session: JSON.parse(stringFromBase64URL(raw.slice(PREFIX.length))) };
}

/**
 * Rewrites the session cookie with only `expires_at` changed, keeping the
 * real access and refresh tokens and the cookie's attributes.
 */
export async function forceExpiresAt(context: BrowserContext, expiresAt: number) {
  const { key, cookies, session } = await readSession(context);
  const encoded = PREFIX + stringToBase64URL(JSON.stringify({ ...session, expires_at: expiresAt }));
  const { domain, path, expires, httpOnly, secure, sameSite } = cookies[0]!;
  for (const { name } of cookies) await context.clearCookies({ name });
  await context.addCookies(
    createChunks(key, encoded).map(({ name, value }) => ({ name, value, domain, path, expires, httpOnly, secure, sameSite })),
  );
}

/** Names of auth cookies a response sets (values are not returned). */
export const authCookiesSet = (setCookieHeaders: string[]) =>
  setCookieHeaders.map((h) => h.split("=", 1)[0]!.trim()).filter((name) => AUTH_COOKIE.test(name));

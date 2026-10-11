import { redirect } from "next/navigation";
import { z } from "zod";

const BASE = "http://spindle.invalid";

/**
 * Only same-origin relative paths are allowed as post-sign-in destinations.
 * Rejects protocol-relative ("//x"), backslash ("/\x") and control-character tricks.
 */
export function safeNext(value: unknown, fallback = "/gyms"): string {
  if (typeof value !== "string" || !value.startsWith("/") || /[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    const url = new URL(value, BASE);
    const path = `${url.pathname}${url.search}${url.hash}`;
    // Dot segments can collapse "/a/..//x" into "//x", which browsers treat as another host.
    return url.origin === BASE && !path.startsWith("//") ? path : fallback;
  } catch {
    return fallback;
  }
}

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/, "Use 3–48 lowercase letters, numbers or hyphens.");

/** Parses FormData with a zod schema, redirecting back with a message on failure. */
export function parseForm<T extends z.ZodType>(schema: T, form: FormData, back: string): z.infer<T> {
  const result = schema.safeParse(Object.fromEntries(form));
  if (!result.success) fail(back, result.error.issues[0]?.message ?? "Check the form and try again.");
  return result.data;
}

export function fail(back: string, message: string): never {
  const separator = back.includes("?") ? "&" : "?";
  redirect(`${back}${separator}error=${encodeURIComponent(message)}`);
}

import { redirect } from "next/navigation";
import type { z } from "zod";

/** Only same-site relative paths are allowed as post-sign-in destinations. */
export function safeNext(value: unknown, fallback = "/gyms"): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

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

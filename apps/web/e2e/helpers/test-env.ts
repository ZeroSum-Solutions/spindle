// Test-only overrides that let a writer run the suite on its own isolated stack and port.
// Both are validated: Mailpit must be a loopback http(s) URL, and the port an unprivileged integer.

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** The Mailpit base URL (default the shared stack's :54324). Only http(s) on loopback is accepted. */
export function mailpitUrl(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const raw = env.MAILPIT_URL ?? "http://127.0.0.1:54324";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("MAILPIT_URL must be a URL");
  }
  if (!["http:", "https:"].includes(url.protocol) || !LOOPBACK.has(url.hostname) || url.username || url.password || url.search || url.hash) {
    throw new Error("MAILPIT_URL must be an http(s) URL on loopback (127.0.0.1, localhost or ::1)");
  }
  return url.origin;
}

/** The app port for this run (default 3100). Only an integer from 1024 to 65535 is accepted. */
export function e2ePort(env: Readonly<Record<string, string | undefined>> = process.env): number {
  const raw = env.E2E_PORT ?? "3100";
  if (!/^\d{4,5}$/.test(raw) || Number(raw) < 1024 || Number(raw) > 65535) throw new Error("E2E_PORT must be an integer from 1024 to 65535");
  return Number(raw);
}

/** Fetches from Mailpit without following redirects, so a redirect can never send a request off loopback. */
export const mailpitFetch = (path: string) => fetch(`${mailpitUrl()}${path}`, { redirect: "error" });

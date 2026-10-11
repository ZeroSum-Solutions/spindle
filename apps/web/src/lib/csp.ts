// Content Security Policy for every route. Built here (not inline in next.config.ts) so
// the rules are unit-tested. Third-party allowances are YouTube only (D-09): the
// privacy-enhanced player frame, and the official IFrame API loader plus the widget
// script it fetches, both loaded only after a learner presses play.

import { IFRAME_API_URL, PLAYER_ORIGIN, WIDGET_SCRIPT_PREFIX } from "./video/youtube";

export interface CspOptions {
  dev: boolean;
  /** Supabase API URL. Stored video plays from a short-lived signed Storage URL on this origin. */
  supabaseUrl?: string;
}

export function contentSecurityPolicy({ dev, supabaseUrl }: CspOptions): string {
  const storage = supabaseOrigin(supabaseUrl);
  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    // Next.js inlines its bootstrap scripts; nonces would need the proxy. Dev adds eval for React tooling.
    ["script-src", ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : []), IFRAME_API_URL, WIDGET_SCRIPT_PREFIX]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "blob:", "data:"]],
    ["media-src", ["'self'", ...(storage ? [storage] : [])]],
    ["font-src", ["'self'"]],
    ["connect-src", ["'self'"]],
    ["frame-src", [PLAYER_ORIGIN]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ];
  return directives.map(([name, values]) => `${name} ${values.join(" ")}`).join("; ");
}

function supabaseOrigin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const { protocol, origin } = new URL(url);
    return protocol === "https:" || protocol === "http:" ? origin : null;
  } catch {
    return null;
  }
}

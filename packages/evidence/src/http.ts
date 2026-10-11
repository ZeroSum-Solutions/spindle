import type { z } from "zod";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class EvidenceHttpError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly url: string,
  ) {
    super(message);
    this.name = "EvidenceHttpError";
  }
}

export class EvidenceValidationError extends Error {
  constructor(
    message: string,
    readonly url: string,
  ) {
    super(message);
    this.name = "EvidenceValidationError";
  }
}

/** Minimum gap between calls, per host. Conservative on purpose. */
export const DEFAULT_INTERVALS_MS: Readonly<Record<string, number>> = {
  "eutils.ncbi.nlm.nih.gov": 340, // 3 req/s without an API key
  "api.crossref.org": 100,
  "api.openalex.org": 100,
  "api.unpaywall.org": 100,
  "api.semanticscholar.org": 1000, // 1 req/s
  "www.ebi.ac.uk": 100,
  "query.wikidata.org": 250,
  "wger.de": 200,
};

export interface HttpOptions {
  fetch?: FetchLike;
  timeoutMs?: number;
  maxRetries?: number;
  intervalsMs?: Readonly<Record<string, number>>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface RequestOptions {
  userAgent: string;
  headers?: Record<string, string>;
  /** Overrides the per-host interval for this call (for example PubMed with a key). */
  minIntervalMs?: number;
  /** Statuses returned as `null` instead of thrown (for example 404). */
  nullStatuses?: readonly number[];
}

export interface Http {
  fetchJson<S extends z.ZodType>(
    url: string,
    schema: S,
    opts: RequestOptions & { nullStatuses: readonly number[] },
  ): Promise<z.output<S> | null>;
  fetchJson<S extends z.ZodType>(url: string, schema: S, opts: RequestOptions): Promise<z.output<S>>;
}

const MAX_RETRY_AFTER_MS = 30_000;

/** Hide secrets that travel in query strings before a URL reaches an error message. */
export function redactUrl(url: string): string {
  return url.replace(/([?&](?:api_key|apikey|key)=)[^&]*/gi, "$1***");
}

export function parseRetryAfter(value: string | null, nowMs: number): number | null {
  if (!value) return null;
  const secs = Number(value);
  if (Number.isFinite(secs)) return Math.min(Math.max(secs, 0) * 1000, MAX_RETRY_AFTER_MS);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return null;
  return Math.min(Math.max(date - nowMs, 0), MAX_RETRY_AFTER_MS);
}

export function createHttp(options: HttpOptions = {}): Http {
  const doFetch: FetchLike = options.fetch ?? ((u, i) => fetch(u, i));
  const timeoutMs = options.timeoutMs ?? 20_000;
  const maxRetries = options.maxRetries ?? 3;
  const intervals = options.intervalsMs ?? DEFAULT_INTERVALS_MS;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = options.now ?? (() => Date.now());
  const nextSlot = new Map<string, number>();

  async function acquire(host: string, override?: number): Promise<void> {
    const interval = override ?? intervals[host] ?? 0;
    if (interval <= 0) return;
    // Reserve the slot synchronously so concurrent callers queue up in order.
    const slot = Math.max(now(), nextSlot.get(host) ?? 0);
    nextSlot.set(host, slot + interval);
    const wait = slot - now();
    if (wait > 0) await sleep(wait);
  }

  async function fetchJson(url: string, schema: z.ZodType, opts: RequestOptions): Promise<unknown> {
    const safeUrl = redactUrl(url);
    const host = new URL(url).host;
    let lastError: EvidenceHttpError | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      await acquire(host, opts.minIntervalMs);
      let res: Response;
      try {
        res = await doFetch(url, {
          headers: { Accept: "application/json", "User-Agent": opts.userAgent, ...opts.headers },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        lastError = new EvidenceHttpError(
          `Network error or timeout for ${safeUrl}: ${err instanceof Error ? err.message : String(err)}`,
          null,
          safeUrl,
        );
        if (attempt < maxRetries) {
          await sleep(500 * 2 ** attempt);
          continue;
        }
        throw lastError;
      }

      if (res.ok) {
        let body: unknown;
        try {
          body = await res.json();
        } catch {
          throw new EvidenceValidationError(`Response from ${safeUrl} is not valid JSON`, safeUrl);
        }
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          throw new EvidenceValidationError(
            `Response from ${safeUrl} failed validation: ${parsed.error.message.slice(0, 500)}`,
            safeUrl,
          );
        }
        return parsed.data;
      }

      if (opts.nullStatuses?.includes(res.status)) return null;

      lastError = new EvidenceHttpError(`HTTP ${res.status} from ${safeUrl}`, res.status, safeUrl);
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= maxRetries) throw lastError;
      const hinted = parseRetryAfter(res.headers.get("retry-after"), now());
      await sleep(hinted ?? Math.min(500 * 2 ** attempt, MAX_RETRY_AFTER_MS));
    }
    throw lastError ?? new EvidenceHttpError(`Request failed for ${safeUrl}`, null, safeUrl);
  }

  return { fetchJson: fetchJson as Http["fetchJson"] };
}

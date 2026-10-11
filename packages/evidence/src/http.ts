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

/** Thrown when a provider asks for a longer pause than we allow, or a daily budget is spent. */
export class EvidenceBudgetError extends EvidenceHttpError {
  constructor(message: string, status: number | null, url: string) {
    super(message, status, url);
    this.name = "EvidenceBudgetError";
  }
}

/** Minimum gap between call starts, per host. Conservative on purpose. */
export const DEFAULT_INTERVALS_MS: Readonly<Record<string, number>> = {
  "eutils.ncbi.nlm.nih.gov": 340, // 3 req/s without an API key
  "api.crossref.org": 100,
  "api.openalex.org": 100,
  "api.unpaywall.org": 100,
  "api.semanticscholar.org": 1000, // 1 req/s
  "www.ebi.ac.uk": 100,
  "query.wikidata.org": 250,
  "wger.de": 200,
  "www.youtube.com": 500, // oEmbed: conservative; no published limit
  "generativelanguage.googleapis.com": 1000,
};

/** Requests per UTC day, per host, counted in-process (retries included). Unpaywall allows 100,000. */
export const DEFAULT_DAILY_LIMITS: Readonly<Record<string, number>> = {
  "api.unpaywall.org": 90_000,
};

export const MAX_RETRY_AFTER_MS = 60_000;

export interface HttpOptions {
  fetch?: FetchLike;
  timeoutMs?: number;
  maxRetries?: number;
  intervalsMs?: Readonly<Record<string, number>>;
  dailyLimits?: Readonly<Record<string, number>>;
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
  /** Only this success status counts; any other 2xx is a validation error (for example oEmbed's 200-only rule). */
  requireStatus?: number;
  /** "text" returns the body as a string (validated by the schema) instead of parsing JSON. */
  responseType?: "json" | "text";
}

export interface Http {
  fetchJson<S extends z.ZodType>(
    url: string,
    schema: S,
    opts: RequestOptions & { nullStatuses: readonly number[] },
  ): Promise<z.output<S> | null>;
  fetchJson<S extends z.ZodType>(url: string, schema: S, opts: RequestOptions): Promise<z.output<S>>;
}

const SECRET_PARAM = /([?&;\s"'(](?:api_key|apikey|key|token|access_token|email|mailto)=)[^&\s"')]*/gi;
const EMAIL_ADDRESS = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;

/** Remove secrets and contact details from any text that may reach an error, log or receipt. */
export function sanitize(text: string): string {
  return text
    .replace(SECRET_PARAM, "$1***")
    .replace(/%40/gi, "@")
    .replace(EMAIL_ADDRESS, "<email>");
}

export const redactUrl = sanitize;

/** Milliseconds to wait, uncapped. Null when the header is absent or unreadable. */
export function parseRetryAfter(value: string | null, nowMs: number): number | null {
  if (!value) return null;
  const secs = Number(value);
  if (Number.isFinite(secs)) return Math.max(secs, 0) * 1000;
  const date = Date.parse(value);
  if (Number.isNaN(date)) return null;
  return Math.max(date - nowMs, 0);
}

// Daily counters are shared by every context in the process.
const dailyUsed = new Map<string, number>();
export function resetDailyBudgets(): void {
  dailyUsed.clear();
}

/**
 * Serial FIFO lane per host: one request in flight at a time. A job holds its turn through its own
 * retries, which is the same as re-entering at the front of the queue.
 */
class Lane {
  private tail: Promise<void> = Promise.resolve();
  async run<T>(job: () => Promise<T>): Promise<T> {
    const prev = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((r) => (release = r));
    await prev;
    try {
      return await job();
    } finally {
      release();
    }
  }
}

export function createHttp(options: HttpOptions = {}): Http {
  const doFetch: FetchLike = options.fetch ?? ((u, i) => fetch(u, i));
  const timeoutMs = options.timeoutMs ?? 20_000;
  const maxRetries = options.maxRetries ?? 3;
  const intervals = options.intervalsMs ?? DEFAULT_INTERVALS_MS;
  const dailyLimits = options.dailyLimits ?? DEFAULT_DAILY_LIMITS;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = options.now ?? (() => Date.now());
  const lastStart = new Map<string, number>();
  const cooldownUntil = new Map<string, number>();
  const lanes = new Map<string, Lane>();

  function lane(host: string): Lane {
    let l = lanes.get(host);
    if (!l) lanes.set(host, (l = new Lane()));
    return l;
  }

  /**
   * Wait until both the minimum spacing and any provider pause have passed. A required wait over the cap
   * (a long Retry-After still in force) rejects instead of sending. The send time is stamped by the caller
   * immediately before `fetch`, so a late wake-up can never shrink the gap to the next request.
   */
  async function waitForTurn(host: string, safeUrl: string, override?: number): Promise<void> {
    const interval = Math.max(override ?? intervals[host] ?? 0, 0);
    for (;;) {
      const until = Math.max((lastStart.get(host) ?? -Infinity) + interval, cooldownUntil.get(host) ?? 0);
      const left = until - now();
      if (left <= 0) return;
      if (left > MAX_RETRY_AFTER_MS) {
        throw new EvidenceBudgetError(
          `${host} is paused for another ${Math.round(left / 1000)} s (limit ${MAX_RETRY_AFTER_MS / 1000} s); not sending ${safeUrl}`,
          null,
          safeUrl,
        );
      }
      await sleep(left);
    }
  }

  function pauseHost(host: string, ms: number): void {
    cooldownUntil.set(host, Math.max(cooldownUntil.get(host) ?? 0, now() + ms));
  }

  function countDaily(host: string, safeUrl: string): void {
    const limit = dailyLimits[host];
    if (limit === undefined) return;
    const key = `${host}|${new Date(now()).toISOString().slice(0, 10)}`;
    const used = (dailyUsed.get(key) ?? 0) + 1;
    if (used > limit) {
      throw new EvidenceBudgetError(`Daily request budget of ${limit} for ${host} is spent`, null, safeUrl);
    }
    dailyUsed.set(key, used);
  }

  type Outcome = { done: true; value: unknown } | { done: false; error: EvidenceHttpError };

  async function attemptOnce(
    url: string,
    safeUrl: string,
    schema: z.ZodType,
    opts: RequestOptions,
    attempt: number,
  ): Promise<Outcome> {
    const host = new URL(url).host;
    const backoff = 500 * 2 ** attempt;
    await waitForTurn(host, safeUrl, opts.minIntervalMs);
    countDaily(host, safeUrl);
    let body: unknown;
    try {
      lastStart.set(host, now()); // stamped in the same synchronous step as the send
      const res = await doFetch(url, {
        headers: { Accept: opts.responseType === "text" ? "application/xml, text/plain" : "application/json", "User-Agent": opts.userAgent, ...opts.headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined);
        if (opts.nullStatuses?.includes(res.status)) return { done: true, value: null };
        const error = new EvidenceHttpError(`HTTP ${res.status} from ${safeUrl}`, res.status, safeUrl);
        if (res.status !== 429 && res.status < 500) throw error;
        const hinted = parseRetryAfter(res.headers.get("retry-after"), now());
        if (hinted !== null && hinted > MAX_RETRY_AFTER_MS) {
          pauseHost(host, hinted); // queued followers must not send during the pause
          throw new EvidenceBudgetError(
            `HTTP ${res.status} from ${safeUrl}: provider asked for a ${Math.round(hinted / 1000)} s pause (limit ${MAX_RETRY_AFTER_MS / 1000} s); not retrying`,
            res.status,
            safeUrl,
          );
        }
        const delayMs = hinted ?? backoff;
        pauseHost(host, delayMs); // the next send on this host waits for it
        return { done: false, error };
      }
      if (opts.requireStatus !== undefined && res.status !== opts.requireStatus) {
        await res.body?.cancel().catch(() => undefined);
        throw new EvidenceValidationError(`HTTP ${res.status} from ${safeUrl}; only ${opts.requireStatus} is accepted`, safeUrl);
      }
      const text = await res.text(); // body timeouts land in the catch below and are retried
      if (opts.responseType === "text") body = text;
      else {
        try {
          body = JSON.parse(text);
        } catch {
          throw new EvidenceValidationError(`Response from ${safeUrl} is not valid JSON`, safeUrl);
        }
      }
    } catch (err) {
      if (err instanceof EvidenceHttpError || err instanceof EvidenceValidationError) throw err;
      const message = sanitize(err instanceof Error ? err.message : String(err));
      pauseHost(host, backoff);
      return {
        done: false,
        error: new EvidenceHttpError(`Network error or timeout for ${safeUrl}: ${message}`, null, safeUrl),
      };
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new EvidenceValidationError(
        `Response from ${safeUrl} failed validation: ${sanitize(parsed.error.message).slice(0, 500)}`,
        safeUrl,
      );
    }
    return { done: true, value: parsed.data };
  }

  async function fetchJson(url: string, schema: z.ZodType, opts: RequestOptions): Promise<unknown> {
    const safeUrl = sanitize(url);
    return lane(new URL(url).host).run(async () => {
      let lastError: EvidenceHttpError | null = null;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const outcome = await attemptOnce(url, safeUrl, schema, opts, attempt);
        if (outcome.done) return outcome.value;
        lastError = outcome.error;
      }
      throw lastError ?? new EvidenceHttpError(`Request failed for ${safeUrl}`, null, safeUrl);
    });
  }

  return { fetchJson: fetchJson as Http["fetchJson"] };
}

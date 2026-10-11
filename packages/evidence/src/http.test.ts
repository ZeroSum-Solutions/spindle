import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createHttp,
  EvidenceBudgetError,
  EvidenceHttpError,
  EvidenceValidationError,
  parseRetryAfter,
  resetDailyBudgets,
  sanitize,
} from "./http";

const schema = z.object({ ok: z.literal(true) });
const opts = { userAgent: "test-agent" };

/** Virtual clock: sleeping advances time instantly. */
function vclock(start = 1_000_000) {
  let t = start;
  const sleeps: number[] = [];
  return {
    sleeps,
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
  };
}

function sequence(...replies: Response[]) {
  const calls: string[] = [];
  const fetch = async (url: string) => {
    calls.push(url);
    const r = replies.shift();
    if (!r) throw new Error("no more replies");
    return r;
  };
  return { fetch, calls };
}

describe("fetchJson", () => {
  it("retries 429 and honors Retry-After", async () => {
    const { sleeps, ...clock } = vclock();
    const { fetch, calls } = sequence(
      new Response("", { status: 429, headers: { "retry-after": "2" } }),
      Response.json({ ok: true }),
    );
    const http = createHttp({ fetch, ...clock, intervalsMs: {} });
    await expect(http.fetchJson("https://a.test/x", schema, opts)).resolves.toEqual({ ok: true });
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([2000]);
  });

  it("backs off on 5xx and gives up after maxRetries", async () => {
    const { sleeps, ...clock } = vclock();
    const { fetch, calls } = sequence(...[1, 2, 3].map(() => new Response("", { status: 503 })));
    const http = createHttp({ fetch, maxRetries: 2, ...clock, intervalsMs: {} });
    await expect(http.fetchJson("https://a.test/x", schema, opts)).rejects.toMatchObject({ status: 503 });
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([500, 1000]);
  });

  it("does not retry other 4xx", async () => {
    const { fetch, calls } = sequence(new Response("", { status: 400 }));
    const http = createHttp({ fetch, intervalsMs: {} });
    await expect(http.fetchJson("https://a.test/x", schema, opts)).rejects.toBeInstanceOf(EvidenceHttpError);
    expect(calls).toHaveLength(1);
  });

  it("returns null for listed statuses", async () => {
    const { fetch } = sequence(new Response("Resource not found.", { status: 404 }));
    const http = createHttp({ fetch, intervalsMs: {} });
    await expect(http.fetchJson("https://a.test/x", schema, { ...opts, nullStatuses: [404] })).resolves.toBeNull();
  });

  it("throws a validation error when the body does not match", async () => {
    const { fetch } = sequence(Response.json({ ok: false }));
    const http = createHttp({ fetch, intervalsMs: {} });
    await expect(http.fetchJson("https://a.test/x", schema, opts)).rejects.toBeInstanceOf(EvidenceValidationError);
  });

  it("sends the User-Agent and an abort signal, and retries network errors", async () => {
    const seen: RequestInit[] = [];
    let n = 0;
    const fetch = async (_url: string, init?: RequestInit) => {
      seen.push(init ?? {});
      if (n++ === 0) throw new TypeError("fetch failed");
      return Response.json({ ok: true });
    };
    const http = createHttp({ fetch, ...vclock(), intervalsMs: {} });
    await http.fetchJson("https://a.test/x", schema, opts);
    expect(seen[1]?.signal).toBeInstanceOf(AbortSignal);
    expect((seen[1]?.headers as Record<string, string>)["User-Agent"]).toBe("test-agent");
  });

  it("spaces requests to the same host by the configured interval", async () => {
    const sleeps: number[] = [];
    const fetch = async () => Response.json({ ok: true });
    const http = createHttp({
      fetch,
      now: () => 1000,
      sleep: async (ms) => void sleeps.push(ms),
      intervalsMs: { "slow.test": 1000 },
    });
    await Promise.all([1, 2, 3].map(() => http.fetchJson("https://slow.test/x", schema, opts)));
    await http.fetchJson("https://fast.test/x", schema, opts);
    expect(sleeps).toEqual([1000, 2000]);
  });

  it("redacts API keys from errors", async () => {
    const { fetch } = sequence(new Response("", { status: 400 }));
    const http = createHttp({ fetch, intervalsMs: {} });
    const err = await http.fetchJson("https://a.test/x?api_key=SECRET&id=1", schema, opts).catch((e: Error) => e);
    expect((err as Error).message).not.toContain("SECRET");
    expect(sanitize("https://a.test/?a=1&api_key=abc")).toBe("https://a.test/?a=1&api_key=***");
  });
});

describe("hardening", () => {
  it("scrubs keys and contact emails from error messages, including the transport message", async () => {
    const fetch = async () => {
      throw new TypeError("connect failed for https://a.test/x?api_key=SECRET&email=me%40example.org and me@example.org");
    };
    const http = createHttp({ fetch, maxRetries: 0, intervalsMs: {} });
    const err = (await http
      .fetchJson("https://a.test/x?api_key=SECRET&email=me%40example.org&mailto=me@example.org", schema, opts)
      .catch((e: Error) => e)) as Error;
    expect(err.message).not.toMatch(/SECRET|example\.org/);
    expect(sanitize("User-Agent mailto:me@example.org")).not.toContain("example.org");
  });

  it("fails clearly instead of retrying early when Retry-After exceeds the cap", async () => {
    const { fetch, calls } = sequence(new Response("", { status: 429, headers: { "retry-after": "120" } }));
    const http = createHttp({ fetch, intervalsMs: {} });
    const err = await http.fetchJson("https://a.test/x", schema, opts).catch((e: Error) => e);
    expect(err).toBeInstanceOf(EvidenceBudgetError);
    expect((err as Error).message).toMatch(/120 s pause/);
    expect(calls).toHaveLength(1);
  });

  it("honors a Retry-After up to the cap in full, and queued requests wait for it too", async () => {
    const { sleeps, ...clock } = vclock();
    const { fetch } = sequence(new Response("", { status: 429, headers: { "retry-after": "45" } }), Response.json({ ok: true }));
    const http = createHttp({ fetch, ...clock, intervalsMs: {} });
    await http.fetchJson("https://a.test/x", schema, opts);
    expect(sleeps).toEqual([45_000]);
  });

  it("makes requests already waiting for a slot honor a pause set meanwhile", async () => {
    // Sleeps take real (tiny) time proportional to the virtual wait, so requests truly overlap.
    let t = 0;
    const sleep = (ms: number) =>
      new Promise<void>((r) =>
        setTimeout(() => {
          t = Math.max(t, t + ms);
          r();
        }, ms / 1000),
      );
    const sentAt: number[] = [];
    let n = 0;
    const fetch = async () => {
      sentAt.push(t);
      return n++ === 0 ? new Response("", { status: 429, headers: { "retry-after": "45" } }) : Response.json({ ok: true });
    };
    const http = createHttp({ fetch, now: () => t, sleep, intervalsMs: { "slow.test": 100 }, concurrency: { "slow.test": 5 } });
    await Promise.all([1, 2, 3, 4].map(() => http.fetchJson("https://slow.test/x", schema, opts)));
    const [first, ...rest] = sentAt;
    expect(first).toBe(0);
    expect(rest.length).toBeGreaterThanOrEqual(4);
    expect(Math.min(...rest)).toBeGreaterThanOrEqual(45_000);
  });

  it("retries a body-read timeout instead of reporting a validation error", async () => {
    let n = 0;
    const fetch = async () => {
      if (n++ === 0) {
        const body = new ReadableStream({
          pull() {
            throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
          },
        });
        return new Response(body, { status: 200 });
      }
      return Response.json({ ok: true });
    };
    const http = createHttp({ fetch, ...vclock(), intervalsMs: {} });
    await expect(http.fetchJson("https://a.test/x", schema, opts)).resolves.toEqual({ ok: true });
    expect(n).toBe(2);
  });

  it("aborts a hung request at the timeout and reports it", async () => {
    const fetch = (_u: string, init?: RequestInit) =>
      new Promise<Response>((_res, rej) => init?.signal?.addEventListener("abort", () => rej(init.signal?.reason)));
    const http = createHttp({ fetch, timeoutMs: 20, maxRetries: 1, ...vclock(), intervalsMs: {} });
    await expect(http.fetchJson("https://a.test/x", schema, opts)).rejects.toThrow(/Network error or timeout/);
  });

  it("treats malformed JSON as a validation error without retrying", async () => {
    const { fetch, calls } = sequence(new Response("<html>", { status: 200 }));
    const http = createHttp({ fetch, intervalsMs: {} });
    await expect(http.fetchJson("https://a.test/x", schema, opts)).rejects.toBeInstanceOf(EvidenceValidationError);
    expect(calls).toHaveLength(1);
  });

  it("limits in-flight requests per host", async () => {
    let active = 0;
    let peak = 0;
    const fetch = async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return Response.json({ ok: true });
    };
    const http = createHttp({ fetch, intervalsMs: {}, concurrency: { "api.crossref.org": 3 } });
    await Promise.all(Array.from({ length: 9 }, () => http.fetchJson("https://api.crossref.org/x", schema, opts)));
    expect(peak).toBe(3);
    peak = 0;
    await Promise.all(Array.from({ length: 6 }, () => http.fetchJson("https://other.test/x", schema, opts)));
    expect(peak).toBe(2);
  });

  it("stops at the daily budget across contexts", async () => {
    resetDailyBudgets();
    const fetch = async () => Response.json({ ok: true });
    const mk = () => createHttp({ fetch, intervalsMs: {}, dailyLimits: { "api.unpaywall.org": 2 } });
    await mk().fetchJson("https://api.unpaywall.org/v2/x", schema, opts);
    await mk().fetchJson("https://api.unpaywall.org/v2/x", schema, opts);
    await expect(mk().fetchJson("https://api.unpaywall.org/v2/x", schema, opts)).rejects.toBeInstanceOf(EvidenceBudgetError);
    resetDailyBudgets();
  });
});

describe("parseRetryAfter", () => {
  it("reads seconds and HTTP dates without capping", () => {
    expect(parseRetryAfter("3", 0)).toBe(3000);
    expect(parseRetryAfter("9999", 0)).toBe(9_999_000);
    expect(parseRetryAfter(new Date(5000).toUTCString(), 2000)).toBe(3000);
    expect(parseRetryAfter(null, 0)).toBeNull();
    expect(parseRetryAfter("soon", 0)).toBeNull();
  });
});

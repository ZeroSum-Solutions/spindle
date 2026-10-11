import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createHttp, EvidenceHttpError, EvidenceValidationError, parseRetryAfter, redactUrl } from "./http";

const schema = z.object({ ok: z.literal(true) });
const opts = { userAgent: "test-agent" };

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
    const sleeps: number[] = [];
    const { fetch, calls } = sequence(
      new Response("", { status: 429, headers: { "retry-after": "2" } }),
      Response.json({ ok: true }),
    );
    const http = createHttp({ fetch, sleep: async (ms) => void sleeps.push(ms), intervalsMs: {} });
    await expect(http.fetchJson("https://a.test/x", schema, opts)).resolves.toEqual({ ok: true });
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([2000]);
  });

  it("backs off on 5xx and gives up after maxRetries", async () => {
    const sleeps: number[] = [];
    const { fetch, calls } = sequence(...[1, 2, 3].map(() => new Response("", { status: 503 })));
    const http = createHttp({ fetch, maxRetries: 2, sleep: async (ms) => void sleeps.push(ms), intervalsMs: {} });
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
    const http = createHttp({ fetch, sleep: async () => {}, intervalsMs: {} });
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
    expect(redactUrl("https://a.test/?a=1&api_key=abc")).toBe("https://a.test/?a=1&api_key=***");
  });
});

describe("parseRetryAfter", () => {
  it("reads seconds and HTTP dates, and caps the wait", () => {
    expect(parseRetryAfter("3", 0)).toBe(3000);
    expect(parseRetryAfter("9999", 0)).toBe(30_000);
    expect(parseRetryAfter(new Date(5000).toUTCString(), 2000)).toBe(3000);
    expect(parseRetryAfter(null, 0)).toBeNull();
    expect(parseRetryAfter("soon", 0)).toBeNull();
  });
});

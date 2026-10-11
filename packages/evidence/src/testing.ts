import { readFileSync } from "node:fs";
import { createContext, type EvidenceContext } from "./context";
import type { FetchLike } from "./http";

export function fixture<T = unknown>(name: string): T {
  const url = new URL(`./__fixtures__/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as T;
}

export interface Call {
  url: string;
  headers: Record<string, string>;
}

type Reply = Response | unknown;
type Route = readonly [match: string, reply: Reply | (() => Reply)];

/** Fetch stub: first route whose substring matches the URL answers. Anything else fails the test. */
export function fakeFetch(routes: Route[]): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, headers: { ...(init?.headers as Record<string, string>) } });
    const route = routes.find(([m]) => url.includes(m));
    if (!route) throw new Error(`Unexpected network call in test: ${url}`);
    const reply = typeof route[1] === "function" ? (route[1] as () => Reply)() : route[1];
    return reply instanceof Response ? reply : Response.json(reply);
  };
  return { fetch, calls };
}

export function testContext(
  routes: Route[],
  env: Record<string, string | undefined> = { SPINDLE_CONTACT_EMAIL: "test@example.org" },
): { ctx: EvidenceContext; calls: Call[]; sleeps: number[] } {
  const { fetch, calls } = fakeFetch(routes);
  const sleeps: number[] = [];
  let t = Date.parse("2026-01-01T00:00:00Z"); // virtual clock: sleeping advances it
  const ctx = createContext({
    env,
    fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
      t += ms;
    },
    now: () => new Date(t),
  });
  return { ctx, calls, sleeps };
}

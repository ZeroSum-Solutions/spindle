import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not found"); } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(), currentUser: vi.fn() }));
const { heldTexts } = await import("./load");

// Sol R3 on #46: the loader reads the whole pending queue in 500-row pages after a seq cursor,
// so a queue past PostgREST's 1,000-row max_rows is never truncated, then the history separately.

const ORG = randomUUID();
const row = (seq: number, status: "pending" | "admitted") => ({
  text_id: randomUUID(), org_id: ORG, org_name: "Synthetic gym", org_slug: "synthetic-gym", slot: "catalog_headline",
  course_id: null, course_title: null, text: `Synthetic text ${seq}`, text_hash: "a".repeat(64), rules_version: "r1",
  saved_at: "2026-10-11T00:00:00Z", status, superseded: false, decided_by: null, decided_at: null, reason: null,
  revoked_at: null, revocation_reason: null, seq,
});

type Call = { fn: string; args?: { p_after: number; p_limit: number } };

/** A fake publisher client: `pending` rows with seq 1..n served by cursor, and `history` rows. */
function fakeClient(pending: number, history: number, opts: { failOnPendingCall?: number; overfullPage?: boolean } = {}) {
  const queue = Array.from({ length: pending }, (_, i) => row(i + 1, "pending"));
  const past = Array.from({ length: history }, (_, i) => row(pending + history - i, "admitted"));
  const calls: Call[] = [];
  const rpc = vi.fn(async (fn: string, args?: { p_after: number; p_limit: number }) => {
    calls.push({ fn, args });
    if (fn === "admission_pending_tenant_texts") {
      const n = calls.filter((c) => c.fn === fn).length;
      if (n === opts.failOnPendingCall) return { data: null, error: { message: "secret detail", code: "XX000" } };
      const limit = opts.overfullPage ? args!.p_limit + 1 : args!.p_limit;
      return { data: queue.filter((r) => r.seq > args!.p_after).slice(0, limit), error: null };
    }
    if (fn === "admission_tenant_texts") return { data: past, error: null };
    throw new Error(`unexpected rpc ${fn}`);
  });
  return { client: { rpc } as never, calls, queue, past };
}

describe("heldTexts pages through the whole pending queue", () => {
  it.each([
    [0, 1],
    [1, 1],
    [499, 1],
    [500, 2],
    [502, 2],
    [1000, 3],
    [1001, 3],
    [1500, 4],
  ])("%i pending rows take %i pending-page requests and all arrive once", async (pending, pages) => {
    const { client, calls, queue, past } = fakeClient(pending, 500);
    const rows = await heldTexts(client);

    const pendingCalls = calls.filter((c) => c.fn === "admission_pending_tenant_texts");
    expect(pendingCalls).toHaveLength(pages);
    // Every request asks for at most 500 rows, after the previous page's last seq.
    expect(pendingCalls.map((c) => c.args!.p_limit)).toEqual(Array(pages).fill(500));
    expect(pendingCalls.map((c) => c.args!.p_after)).toEqual(Array.from({ length: pages }, (_, i) => i * 500));
    expect(calls.filter((c) => c.fn === "admission_tenant_texts")).toHaveLength(1);

    const pendingOut = rows.filter((r) => r.status === "pending");
    expect(pendingOut).toHaveLength(pending);
    expect(new Set(pendingOut.map((r) => r.text_id))).toEqual(new Set(queue.map((r) => r.text_id)));
    expect(new Set(rows.map((r) => r.text_id)).size, "no row repeated across pages").toBe(rows.length);
    // Pending newest first, then the history as served.
    expect(pendingOut.map((r) => r.seq)).toEqual(queue.map((r) => r.seq).reverse());
    expect(rows.slice(pending).map((r) => r.text_id)).toEqual(past.map((r) => r.text_id));
  });

  it.each([1, 2, 3])("a failure on pending page %i fails the whole read with a generic message", async (failOn) => {
    const { client } = fakeClient(1200, 10, { failOnPendingCall: failOn });
    const err = await heldTexts(client).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("Could not load the held texts.");
    expect(String(err)).not.toMatch(/secret|XX000/);
  });

  it("refuses a page longer than the requested 500 rows", async () => {
    const { client } = fakeClient(800, 0, { overfullPage: true });
    await expect(heldTexts(client)).rejects.toThrow();
  });
});

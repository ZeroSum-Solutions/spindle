import { afterEach, describe, expect, it, vi } from "vitest";
// The browser-test fixtures write synthetic rows, so they must only ever talk to this
// machine. Tested here, as pure functions, so the check never boots a server.
import { assertLoopback, userClient } from "../../../e2e/player-fixtures";

describe("player fixtures", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("refuse a remote Supabase API before any network call", async () => {
    const fetch = vi.fn(() => {
      throw new Error("network call attempted");
    });
    vi.stubGlobal("fetch", fetch);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://remote.example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "synthetic-not-a-key");
    await expect(userClient("someone@player.test")).rejects.toThrow(/refuse a non-local Supabase API \(remote\.example\.supabase\.co\)/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["http://127.0.0.1:54321", "http://localhost:54321", "postgresql://u:p@127.0.0.1:54322/db", "http://[::1]:54321"])("accept %s", (url) => {
    expect(() => assertLoopback(url, "x")).not.toThrow();
  });

  it.each(["https://abc.supabase.co", "http://10.0.0.5:54321", "http://127.0.0.1.nip.io", "http://localhost.evil.test", "not a url"])("refuse %s", (url) => {
    expect(() => assertLoopback(url, "x")).toThrow();
  });
});

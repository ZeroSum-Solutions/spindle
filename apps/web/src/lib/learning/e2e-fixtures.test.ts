import { afterEach, describe, expect, it, vi } from "vitest";
// The browser-test fixtures write synthetic rows, so they must only ever talk to this
// machine. Tested here, as pure functions, so the check never boots a server.
import { assertLoopback, psqlConnection, userClient } from "../../../e2e/player-fixtures";

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

describe("psqlConnection", () => {
  const LOCAL = "postgresql://postgres:synthetic@127.0.0.1:54322/postgres";

  it("builds psql arguments from validated parts only", () => {
    const { args, env } = psqlConnection(LOCAL, { PATH: "/bin" });
    expect(args).toEqual(["-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "postgres", "-w"]);
    expect(env.PATH).toBe("/bin");
  });

  it.each([
    "postgresql://postgres:x@127.0.0.1:54322/postgres?hostaddr=203.0.113.7",
    "postgresql://postgres:x@127.0.0.1:54322/postgres?host=db.example.com",
    "postgresql://postgres:x@127.0.0.1:54322/postgres?service=remote",
    "postgresql://postgres:x@127.0.0.1:54322/postgres?sslmode=disable",
    "postgresql://postgres:x@127.0.0.1:54322/postgres#x",
    "postgresql://postgres:x@127.0.0.1:54322/host=db.example.com",
    "postgresql://host=evil:x@127.0.0.1:54322/postgres",
    "postgresql://postgres:x@db.example.com:54322/postgres",
    "mysql://postgres:x@127.0.0.1:54322/postgres",
  ])("refuses %s", (url) => {
    expect(() => psqlConnection(url, {})).toThrow(/refuse|need/);
  });

  it("drops every inherited PG* override from the child environment", () => {
    const inherited = {
      PATH: "/bin",
      PGHOST: "db.example.com",
      PGHOSTADDR: "203.0.113.7",
      PGPORT: "6543",
      PGSERVICE: "remote",
      PGSERVICEFILE: "/tmp/service.conf",
      PGPASSFILE: "/tmp/passfile",
      PGDATABASE: "other",
      PGUSER: "other",
      PGSSLMODE: "disable",
    };
    const { env } = psqlConnection(LOCAL, inherited);
    expect(Object.keys(env).filter((k) => k.startsWith("PG")).sort()).toEqual(["PGCONNECT_TIMEOUT", "PGOPTIONS", "PGPASSWORD"]);
  });
});

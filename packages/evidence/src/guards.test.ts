import { describe, expect, it } from "vitest";
import { privateDir, psqlTarget, requireUuid } from "./guards";

describe("psqlTarget", () => {
  it("accepts an isolated loopback database and drops inherited PG* settings", () => {
    const t = psqlTarget("postgresql://postgres:pw@127.0.0.1:55434/postgres", { PATH: "/bin", PGHOST: "evil", PGSERVICE: "x" });
    expect(t.args.slice(0, 4)).toEqual(["-h", "127.0.0.1", "-p", "55434"]);
    expect(Object.keys(t.env).filter((k) => k.startsWith("PG")).sort()).toEqual(["PGCONNECT_TIMEOUT", "PGOPTIONS", "PGPASSWORD"]);
  });

  it.each([
    [undefined, /set SPINDLE_DB_URL/],
    ["postgresql://postgres:pw@127.0.0.1:54322/postgres", /shared local stack/],
    ["postgresql://postgres:pw@localhost:54322/postgres", /shared local stack/],
    ["postgresql://postgres:pw@db.example.com:5432/postgres", /non-local/],
    ["postgresql://postgres:pw@127.0.0.1:55434/postgres?host=evil", /parameters/],
    ["mysql://u:p@127.0.0.1:3306/x", /postgresql/],
  ])("refuses %s", (url, error) => {
    expect(() => psqlTarget(url, {})).toThrow(error);
  });

  it("allows the shared stack only with the lead's explicit switch", () => {
    expect(() => psqlTarget("postgresql://postgres:pw@127.0.0.1:54322/postgres", { SPINDLE_ALLOW_SHARED_DB: "1" })).not.toThrow();
  });
});

describe("privateDir and ids", () => {
  it("refuses a directory inside the repository", () => {
    expect(() => privateDir("/repo/packets", "/repo", "X")).toThrow(/inside the repository/);
    expect(() => privateDir("/repo", "/repo", "X")).toThrow(/inside the repository/);
    expect(() => privateDir("packets", "/repo", "X")).toThrow(/absolute/);
    expect(() => privateDir(undefined, "/repo", "X")).toThrow(/set X/);
    expect(privateDir("/private/packets", "/repo", "X")).toBe("/private/packets");
    expect(privateDir("/repo-other/p", "/repo", "X")).toBe("/repo-other/p");
  });

  it("compares real paths and refuses any git work tree", () => {
    const real = (p: string) => p.toLowerCase();
    expect(() => privateDir("/repo/..x", "/repo", "X", { realpath: (p) => p, insideGit: () => false })).toThrow(/inside the repository/);
    expect(() => privateDir("/REPO/packets", "/repo", "X", { realpath: real, insideGit: () => false })).toThrow(/inside the repository/);
    expect(() => privateDir("/elsewhere/spindle/p", "/repo", "X", { realpath: (p) => p, insideGit: () => true })).toThrow(/git work tree/);
    expect(privateDir("/private/p", "/repo", "X", { realpath: (p) => p, insideGit: () => false })).toBe("/private/p");
  });

  it("requires lowercase uuids", () => {
    expect(() => requireUuid("x", "ID")).toThrow(/ID must be/);
    expect(requireUuid("11111111-1111-4111-8111-111111111111", "ID")).toMatch(/^1/);
  });
});

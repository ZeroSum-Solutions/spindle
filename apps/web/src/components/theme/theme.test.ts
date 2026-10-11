import { describe, expect, it } from "vitest";
import { THEME_KEY, THEME_SCRIPT, isThemeChoice } from "./theme";

/** Runs the head script against a fake document, location and storage. */
function run(search: string, stored: string | null, storageThrows = false) {
  const store = new Map<string, string>(stored === null ? [] : [[THEME_KEY, stored]]);
  const dataset: Record<string, string> = {};
  const localStorage = {
    getItem: (k: string) => {
      if (storageThrows) throw new Error("blocked");
      return store.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (storageThrows) throw new Error("blocked");
      store.set(k, v);
    },
  };
  new Function("location", "localStorage", "document", "URLSearchParams", THEME_SCRIPT)({ search }, localStorage, { documentElement: { dataset } }, URLSearchParams);
  return { theme: dataset.theme, stored: store.get(THEME_KEY) ?? null };
}

describe("the theme script", () => {
  it("leaves the theme to the system setting when nothing is chosen", () => {
    expect(run("", null)).toEqual({ theme: undefined, stored: null });
  });
  it("applies the stored choice", () => {
    expect(run("", "dark").theme).toBe("dark");
    expect(run("", "light").theme).toBe("light");
  });
  it("applies and keeps ?theme=", () => {
    expect(run("?theme=dark", "light")).toEqual({ theme: "dark", stored: "dark" });
  });
  it("ignores anything that is not light or dark", () => {
    expect(run("?theme=sepia", "<script>")).toEqual({ theme: undefined, stored: "<script>" });
  });
  it("survives blocked storage: ?theme= still applies to this page", () => {
    expect(run("?theme=dark", null, true).theme).toBe("dark");
    expect(run("", null, true).theme).toBeUndefined();
  });
  it("accepts only the two themes", () => {
    expect(["light", "dark", "auto", "", null].map(isThemeChoice)).toEqual([true, true, false, false, false]);
  });
});

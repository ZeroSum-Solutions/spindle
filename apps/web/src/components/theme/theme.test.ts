import { describe, expect, it } from "vitest";
import { THEME_KEY, THEME_SCRIPT, isThemeChoice } from "./theme";

/** Runs the head script against a fake document, location and storage. */
function run(search: string, stored: string | null, storageThrows = false) {
  const store = new Map<string, string>(stored === null ? [] : [[THEME_KEY, stored]]);
  const dataset: Record<string, string> = {};
  const metas = [{ content: "#f4f5f7" }, { content: "#0b0d12" }].map((m) => ({ ...m, setAttribute: (_: string, v: string) => (m.content = v), m }));
  const listeners: (() => void)[] = [];
  const document = {
    documentElement: { dataset },
    querySelectorAll: () => metas,
    addEventListener: (_: string, f: () => void) => listeners.push(f),
  };
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
  new Function("location", "localStorage", "document", "URLSearchParams", THEME_SCRIPT)({ search }, localStorage, document, URLSearchParams);
  listeners.forEach((f) => f());
  return { theme: dataset.theme, stored: store.get(THEME_KEY) ?? null, chrome: metas.map((x) => x.m.content) };
}

describe("the theme script", () => {
  it("leaves the theme to the system setting when nothing is chosen", () => {
    expect(run("", null)).toEqual({ theme: undefined, stored: null, chrome: ["#f4f5f7", "#0b0d12"] });
  });
  it("applies the stored choice", () => {
    expect(run("", "dark").theme).toBe("dark");
    expect(run("", "light").theme).toBe("light");
  });
  it("applies and keeps ?theme=", () => {
    expect(run("?theme=dark", "light")).toMatchObject({ theme: "dark", stored: "dark" });
  });
  it("ignores anything that is not light or dark", () => {
    expect(run("?theme=sepia", "<script>")).toMatchObject({ theme: undefined, stored: "<script>" });
  });
  it("survives blocked storage: ?theme= still applies to this page", () => {
    expect(run("?theme=dark", null, true).theme).toBe("dark");
    expect(run("", null, true).theme).toBeUndefined();
  });
  it("points the browser chrome (theme-color) at the chosen theme, not only the OS (Sol R2 on #51)", () => {
    expect(run("", "dark").chrome).toEqual(["#0b0d12", "#0b0d12"]);
    expect(run("?theme=light", null).chrome).toEqual(["#f4f5f7", "#f4f5f7"]);
  });
  it("accepts only the two themes", () => {
    expect(["light", "dark", "auto", "", null].map(isThemeChoice)).toEqual([true, true, false, false, false]);
  });
});

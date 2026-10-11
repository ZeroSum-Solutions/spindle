import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// DESIGN.md (the contract) and globals.css (what the app draws with) must carry the same
// type, spacing, radius, elevation and motion tokens. Colours are covered by atlas-sync.test.ts.
const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
const design = readFileSync(new URL("../../../../../DESIGN.md", import.meta.url), "utf8");

/** The YAML front matter as nested maps of strings (the subset DESIGN.md uses: two-space indents, scalars). */
function frontMatter(): Record<string, Record<string, string | Record<string, string>>> {
  const body = design.split(/^---$/m)[1] ?? "";
  const out: Record<string, Record<string, string | Record<string, string>>> = {};
  let section = "";
  let entry = "";
  for (const raw of body.split("\n")) {
    if (!raw.trim()) continue;
    const indent = raw.length - raw.trimStart().length;
    const m = raw.trim().match(/^([\w-]+):\s*(.*)$/);
    if (!m) continue;
    const [, key, value] = m as unknown as [string, string, string];
    const v = value.replace(/^"(.*)"$/, "$1");
    if (indent === 0) {
      section = key;
      out[section] = {};
    } else if (indent === 2) {
      entry = key;
      out[section]![entry] = v === "" ? {} : v;
    } else if (indent === 4) {
      (out[section]![entry] as Record<string, string>)[key] = v;
    }
  }
  return out;
}

/** Every value a CSS custom property is given anywhere in globals.css (base @theme and media overrides). */
function cssValues(name: string): string[] {
  return [...css.matchAll(new RegExp(`--${name}:\\s*([^;]+);`, "g"))].map((m) => m[1]!.trim());
}

const fm = frontMatter();

describe("DESIGN.md front matter and globals.css carry the same tokens", () => {
  it("defines the redesign type roles", () => {
    expect(Object.keys(fm.typography ?? {})).toEqual(
      expect.arrayContaining(["display", "title", "heading", "heading-lesson", "section", "subhead", "reading", "ui", "label", "eyebrow", "code"]),
    );
  });

  it.each(Object.entries(fm.typography ?? {}))("type role %s: size, line height and weight reach the theme", (name, spec) => {
    const s = spec as Record<string, string>;
    // The front matter holds the desktop value; globals.css sets it at its breakpoint (or as the only value).
    expect(cssValues(`text-${name}`), `--text-${name}`).toContain(s.fontSize);
    expect(cssValues(`text-${name}--line-height`), `--text-${name}--line-height`).toContain(s.lineHeight);
    expect(cssValues(`text-${name}--font-weight`), `--text-${name}--font-weight`).toContain(s.fontWeight);
  });

  it("defines the named 8-point spacing steps", () => {
    expect(Object.keys(fm.spacing ?? {})).toEqual(
      expect.arrayContaining(["hair", "tight", "attach", "stack", "block", "group", "safety", "section", "page", "hero"]),
    );
  });

  it.each(Object.entries(fm.spacing ?? {}).filter(([k]) => k !== "unit"))("spacing %s reaches the theme", (name, value) => {
    expect(cssValues(`spacing-${name}`), `--spacing-${name}`).toContain(value);
  });

  it.each(Object.entries(fm.rounded ?? {}))("radius %s reaches the theme", (name, value) => {
    expect(cssValues(`radius-${name}`), `--radius-${name}`).toContain(value);
  });

  it("documents and defines the elevation and motion tokens", () => {
    // Prose tables in DESIGN.md (the design.md schema has no elevation or motion section).
    const rows = [...design.matchAll(/^\|\s*`--((?:duration|ease|shadow)-[\w-]+)`\s*\|\s*([^|]+?)\s*\|/gm)].map((m) => [m[1]!, m[2]!] as const);
    const names = rows.map(([n]) => n);
    expect(names).toEqual(
      expect.arrayContaining([
        "duration-press", "duration-feedback", "duration-disclosure", "duration-route", "duration-drawer", "duration-confirm",
        "duration-reveal", "duration-step", "duration-logo", "duration-celebrate", "ease-out", "ease-in-out", "ease-drawer",
        "shadow-raise", "shadow-float",
      ]),
    );
    for (const [name, value] of rows) expect(cssValues(name), `--${name}`).toContain(value.replace(/^`|`$/g, ""));
  });
});

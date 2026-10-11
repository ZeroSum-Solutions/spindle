// D-13: evidence beyond the abstract. Open-licence (CC BY, CC0, public domain) articles in
// Europe PMC's open-access subset give full-text sections, chosen by the publisher and stored
// with a section locator. Sources without an open licence may carry a short publisher excerpt
// (at most 300 words per source, with a page or section locator). Both live only in the
// private evidence files that go into review packets: never in the repository, never shown
// to learners. They exist for review (criticism and review, fair dealing and fair use).
import { z } from "zod";
import type { EvidenceContext } from "./context";
import { isOpenLicense } from "./ingest";

export const MAX_SECTION_CHARS = 20_000;
export const MAX_FULLTEXT_CHARS_PER_SOURCE = 60_000;
export const MAX_EXCERPT_WORDS_PER_SOURCE = 300;

export interface Excerpt {
  origin: "europepmc-fulltext" | "publisher-excerpt";
  /** Where in the source: "Section: 2. Anatomical Description of the Scapula", "p. 4, PICO 6". */
  locator: string;
  text: string;
  /** Full text: the open licence it is used under. */
  license?: string;
  /** Publisher excerpt: who entered it and the attribution line. */
  attribution?: string;
}

/**
 * The open licence full text may be used under. Every licence any record gives (Unpaywall, Europe
 * PMC, OpenAlex) must be open; one restricted or unknown record refuses it (Sol R1 PR31-01).
 */
export function fullTextLicense(licenses: { unpaywall?: string; europepmc?: string; openalex?: string }): string {
  const given = [licenses.unpaywall, licenses.europepmc, licenses.openalex].filter((l): l is string => !!l);
  if (given.length === 0) throw new Error("no licence recorded for this article; full text needs an open licence");
  const closed = given.find((l) => !isOpenLicense(l));
  if (closed) throw new Error(`licence ${JSON.stringify(closed)} is not open (CC BY, CC0 or public domain); use a publisher excerpt instead`);
  return given[0]!;
}

export const wordCount = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

const ENTITY = /&(?:#(\d{1,7})|#x([\da-fA-F]{1,6})|(lt|gt|quot|apos|amp|nbsp));/g;
const NAMED: Record<string, string> = { lt: "<", gt: ">", quot: '"', apos: "'", amp: "&", nbsp: " " };
const decode = (t: string) =>
  t.replace(ENTITY, (m, d?: string, h?: string, n?: string) => {
    if (n) return NAMED[n] ?? m;
    const c = d ? Number(d) : Number.parseInt(h ?? "", 16);
    return Number.isInteger(c) && c > 0 && c <= 0x10ffff ? String.fromCodePoint(c) : m;
  });

// Well-formed XML: text never holds a raw "<", so one token pattern suffices.
const TOKEN = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!(?!\[CDATA\[)[^>]*>|<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
/** Text inside these elements is not section prose. */
const SKIP = new Set(["fig", "fn-group", "ref-list", "supplementary-material", "disp-formula", "inline-formula", "graphic", "media", "label"]);

interface TableState { label: string; caption: string; head: string[][]; rows: string[][]; row: string[] | null; cell: string | null; part: "label" | "caption" | "head" | "body" | "foot" | null; foot: string; merged: boolean }

/** A cell spanning rows or columns: without a real grid its values would be mislabelled (Sol R1 PR31-02). */
const SPAN = /\b(?:rowspan|colspan)\s*=\s*["']?\s*([0-9]+)/gi;
const spans = (attrs: string | undefined) => [...(attrs ?? "").matchAll(SPAN)].some((m) => Number(m[1]) > 1);

function tableText(t: TableState): string {
  const head = t.head[t.head.length - 1] ?? [];
  const rows = t.rows.map((r) => r.map((v, i) => (head[i] ? `${head[i]}: ${v}` : v)).join("; "));
  return [t.caption, ...rows.map((r) => `${r}.`), t.foot].map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean).join(" ");
}

/**
 * The body's sections in document order, each with its own prose (nested sections apart) and its
 * title path, then one entry per table ("Table: <label>"): caption, rows as "header: value" pairs,
 * and table footnotes. Figures, references and the front matter are skipped.
 */
export interface JatsSection {
  locator: string;
  text: string;
  /** Why this part cannot be excerpted (for example a table with merged cells). */
  unsupported?: string;
}

export function jatsSections(xml: string): JatsSection[] {
  const out: JatsSection[] = [];
  const tables: JatsSection[] = [];
  let table: TableState | null = null;
  const secs: { title: string; parts: string[] }[] = [];
  const stack: string[] = [];
  let inBody = 0;
  let skip = 0;
  let titleFor: { title: string; parts: string[] } | null = null;
  let titleText = "";
  let inP = 0;
  const close = () => {
    const sec = secs.pop()!;
    const text = sec.parts.join(" ").replace(/\s+/g, " ").trim();
    if (text) out.push({ locator: `Section: ${[...secs.map((s) => s.title), sec.title].filter(Boolean).join(" > ")}`, text });
  };
  for (const m of xml.matchAll(TOKEN)) {
    const [, cdata, slash, name, attrs, selfClose, text] = m;
    if (name) {
      if (selfClose) {
        // An empty cell keeps its column.
        if (table && inBody && !skip && (name === "td" || name === "th")) {
          if (spans(attrs)) table.merged = true;
          table.row?.push("");
        }
        continue;
      }
      if (table && inBody && !skip) {
        if (!slash) {
          stack.push(name);
          if (name === "label") table.part = "label";
          else if (name === "caption") table.part = "caption";
          else if (name === "thead") table.part = "head";
          else if (name === "tbody") table.part = "body";
          else if (name === "table-wrap-foot") table.part = "foot";
          else if (name === "tr") table.row = [];
          else if (name === "td" || name === "th") {
            table.cell = "";
            if (spans(attrs)) table.merged = true;
          }
          continue;
        }
        while (stack.length && stack[stack.length - 1] !== name) stack.pop();
        stack.pop();
        if (name === "td" || name === "th") {
          table.row?.push((table.cell ?? "").replace(/\s+/g, " ").trim());
          table.cell = null;
        } else if (name === "tr" && table.row) {
          (table.part === "head" ? table.head : table.rows).push(table.row);
          table.row = null;
        } else if (name === "label" || name === "caption" || name === "table-wrap-foot") table.part = null;
        else if (name === "table-wrap") {
          const label = table.label.replace(/\s+/g, " ").trim() || `Table ${tables.length + 1}`;
          const text = tableText(table);
          if (table.merged) tables.push({ locator: `Table: ${label}`, text: "", unsupported: "it has merged cells (rowspan or colspan); quote it as a publisher excerpt instead" });
          else if (text) tables.push({ locator: `Table: ${label}`, text });
          table = null;
        }
        continue;
      }
      if (!slash) {
        stack.push(name);
        // Floats (tables) may sit in <floats-group> after the body; they count like body content.
        if (name === "body" || name === "floats-group") inBody++;
        if (!inBody) continue;
        if (name === "table-wrap" && !skip) {
          table = { label: "", caption: "", head: [], rows: [], row: null, cell: null, part: null, foot: "", merged: false };
          continue;
        }
        if (SKIP.has(name)) skip++;
        else if (name === "sec") secs.push({ title: "", parts: [] });
        else if (name === "title" && secs.length && stack[stack.length - 2] === "sec") {
          titleFor = secs[secs.length - 1]!;
          titleText = "";
        } else if (name === "p") inP++;
      } else {
        while (stack.length && stack[stack.length - 1] !== name) stack.pop();
        stack.pop();
        if (name === "body" || name === "floats-group") inBody = Math.max(0, inBody - 1);
        if (!inBody && name !== "body" && name !== "floats-group") continue;
        if (SKIP.has(name)) skip = Math.max(0, skip - 1);
        else if (name === "sec" && secs.length) close();
        else if (name === "title" && titleFor) {
          titleFor.title = titleText.replace(/\s+/g, " ").trim();
          titleFor = null;
        } else if (name === "p") inP = Math.max(0, inP - 1);
      }
      continue;
    }
    const chunk = cdata ?? (text !== undefined ? decode(text) : "");
    if (!chunk || !inBody || skip) continue;
    if (table) {
      if (table.cell !== null) table.cell += chunk;
      else if (table.part === "label") table.label += chunk;
      else if (table.part === "caption") table.caption += ` ${chunk}`;
      else if (table.part === "foot") table.foot += ` ${chunk}`;
      continue;
    }
    if (titleFor) titleText += chunk;
    else if (inP && secs.length) secs[secs.length - 1]!.parts.push(chunk);
  }
  while (secs.length) close();
  return [...out, ...tables];
}

/** Europe PMC's open-access full text (JATS XML) for a PMCID, or null when it has none. */
export async function getEuropePmcFullText(ctx: EvidenceContext, pmcid: string): Promise<string | null> {
  if (!/^PMC\d{1,9}$/.test(pmcid)) throw new Error("not a PMCID");
  return ctx.http.fetchJson(`https://www.ebi.ac.uk/europepmc/webservices/rest/${pmcid}/fullTextXML`, z.string().min(1), {
    userAgent: ctx.userAgent(),
    nullStatuses: [404],
    responseType: "text",
  });
}

/**
 * Full-text excerpts for the sections whose locator contains one of `wanted` (case-insensitive).
 * Refused unless the licence is open, every wanted name matches, and the sizes fit.
 */
/**
 * Whether a requested name picks this part: a table by its exact label ("Table 1" never picks
 * "Table 10"), a section when the name appears as whole words inside one heading of its title
 * path ("Normal Scapulothoracic" never picks "Abnormal Scapulothoracic …") (Sol R1 PR31-05).
 */
export function sectionMatches(locator: string, wanted: string): boolean {
  const w = wanted.trim().toLowerCase();
  if (locator.startsWith("Table: ")) return locator.slice(7).trim().toLowerCase() === w;
  if (/^table\s/i.test(w)) return false;
  const words = new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\p{N}])`, "u");
  return locator.replace(/^Section:\s*/, "").split(" > ").some((heading) => words.test(heading.toLowerCase()));
}

/**
 * Full-text excerpts for the requested sections and tables. Refused unless the licence is open,
 * every requested name matches, nothing chosen is unsupported, and the sizes fit.
 */
export function selectSections(sections: readonly JatsSection[], wanted: readonly string[], license: string): Excerpt[] {
  if (!isOpenLicense(license)) throw new Error(`full text needs an open licence (CC BY, CC0 or public domain), not ${JSON.stringify(license)}`);
  if (wanted.length === 0) throw new Error("name at least one section");
  const picked: Excerpt[] = [];
  for (const w of wanted) {
    const hits = sections.filter((s) => sectionMatches(s.locator, w));
    if (hits.length === 0) throw new Error(`no section matches ${JSON.stringify(w)}; sections: ${sections.map((s) => s.locator).join(" | ").slice(0, 1500)}`);
    for (const h of hits) {
      if (h.unsupported) throw new Error(`${h.locator} cannot be excerpted: ${h.unsupported}`);
      if (h.text.length > MAX_SECTION_CHARS) throw new Error(`${h.locator} has ${h.text.length} characters; the limit is ${MAX_SECTION_CHARS}: name a subsection`);
      if (!picked.some((p) => p.locator === h.locator)) picked.push({ origin: "europepmc-fulltext", locator: h.locator.slice(0, 300), text: h.text, license });
    }
  }
  const total = picked.reduce((n, p) => n + p.text.length, 0);
  if (total > MAX_FULLTEXT_CHARS_PER_SOURCE) throw new Error(`the chosen sections hold ${total} characters; the limit per source is ${MAX_FULLTEXT_CHARS_PER_SOURCE}`);
  return picked;
}

/** A publisher excerpt: refused when it would take the source past 300 words of excerpts. */
export function publisherExcerpt(existing: readonly Excerpt[], text: string, locator: string, attribution: string): Excerpt {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) throw new Error("the excerpt is empty");
  if (!/\S/.test(locator) || locator.length > 300) throw new Error("give a page or section locator (at most 300 characters)");
  if (!/\S/.test(attribution) || attribution.length > 500) throw new Error("give an attribution line (at most 500 characters)");
  const used = existing.filter((e) => e.origin === "publisher-excerpt").reduce((n, e) => n + wordCount(e.text), 0);
  const words = wordCount(clean);
  if (used + words > MAX_EXCERPT_WORDS_PER_SOURCE) {
    throw new Error(`excerpts for this source would hold ${used + words} words; the limit is ${MAX_EXCERPT_WORDS_PER_SOURCE}`);
  }
  return { origin: "publisher-excerpt", locator: locator.trim(), text: clean, attribution: attribution.trim() };
}

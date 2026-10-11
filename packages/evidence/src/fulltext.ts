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
const SKIP = new Set(["table-wrap", "fig", "fn-group", "ref-list", "supplementary-material", "disp-formula", "inline-formula", "graphic", "media", "label"]);

/** The body's sections in document order, each with its own prose (nested sections apart) and its title path. */
export function jatsSections(xml: string): { locator: string; text: string }[] {
  const out: { locator: string; text: string }[] = [];
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
    const [, cdata, slash, name, , selfClose, text] = m;
    if (name) {
      if (selfClose) continue;
      if (!slash) {
        stack.push(name);
        if (name === "body") inBody++;
        if (!inBody) continue;
        if (SKIP.has(name)) skip++;
        else if (name === "sec") secs.push({ title: "", parts: [] });
        else if (name === "title" && secs.length && stack[stack.length - 2] === "sec") {
          titleFor = secs[secs.length - 1]!;
          titleText = "";
        } else if (name === "p") inP++;
      } else {
        while (stack.length && stack[stack.length - 1] !== name) stack.pop();
        stack.pop();
        if (name === "body") inBody = Math.max(0, inBody - 1);
        if (!inBody && name !== "body") continue;
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
    if (titleFor) titleText += chunk;
    else if (inP && secs.length) secs[secs.length - 1]!.parts.push(chunk);
  }
  while (secs.length) close();
  return out;
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
export function selectSections(sections: readonly { locator: string; text: string }[], wanted: readonly string[], license: string): Excerpt[] {
  if (!isOpenLicense(license)) throw new Error(`full text needs an open licence (CC BY, CC0 or public domain), not ${JSON.stringify(license)}`);
  if (wanted.length === 0) throw new Error("name at least one section");
  const picked: Excerpt[] = [];
  for (const w of wanted) {
    const hits = sections.filter((s) => s.locator.toLowerCase().includes(w.toLowerCase()));
    if (hits.length === 0) throw new Error(`no section matches ${JSON.stringify(w)}; sections: ${sections.map((s) => s.locator).join(" | ").slice(0, 1500)}`);
    for (const h of hits) {
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

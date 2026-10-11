// Tenant text admission (P4-A2 spec revision 3, section 7). Gyms write a few short texts that
// learners see next to Spindle's own labels: the brand name, catalog lines, coach name and role,
// the course welcome note, and method course titles and summaries. None of them may pass as
// Spindle's science or review wording, carry a link, or hide characters.
//
// The database function private.admit_tenant_text is authoritative; this mirror gives editors the
// same answer before they save. Both run the same versioned rule set (tenant-text-rules.ts, inserted
// by a migration into private.tenant_text_rules), step by step:
//   0. Refuse raw input over rules.rawMax code points before any other work.
//   1. NFC, then trim what String.prototype.trim removes (as the #34 core's zod .trim() does).
//   2. Refuse control, format and separator characters (\p{Cc}\p{Cf}\p{Zl}\p{Zp}): zero-width
//      spaces and joiners, word joiners, bidi controls, the byte-order mark, line separators.
//   3. Length in code points, per slot.
//   4. Visible text required: blank characters (default-ignorables such as U+3164, and U+2800)
//      do not count.
//   5. No link shapes: markup, "@", any scheme, "//", "www.", name.tld, DOI prefixes.
//   5a. No citation or outcome-claim shapes: a year in parentheses ("(2019)"), a percentage
//      with an outcome ("reduces pain by 30%", "30% stronger"). Not overridable.
//   6. Unless LEAD recorded an override for this exact text in this org and slot: no reserved
//      word, matched as a whole token after folding (NFKC, blanks dropped, camelCase split, ASCII
//      lowercase, marks dropped, confusables mapped). Tokens are checked plain and with leet
//      digits and symbols mapped (1 as i, then as l); runs of single letters are joined first
//      ("s c i e n c e") and also searched inside; multi-word terms match as token sequences. A token
//      mixing ASCII letters with unmapped letters of another script is refused ("mixed script").
// Otherwise years and percentages are ordinary practice copy and pass ("Est. 2015", "80% of 1RM").
import { TENANT_TEXT_RULES } from "./tenant-text-rules";

export type TenantTextSlot =
  | "brand_name"
  | "catalog_headline"
  | "catalog_tagline"
  | "coach_name"
  | "coach_role"
  | "welcome"
  | "course_title"
  | "course_summary"
  | "course_blurb";

type Ranges = readonly (readonly [number, number])[];

export interface TenantTextRules {
  version: string;
  slots: Record<TenantTextSlot, readonly [number, number]>;
  /** Raw inputs longer than this (code points) are refused before any other work. */
  rawMax: number;
  chars: { trim: Ranges; refuse: Ranges; blank: Ranges; visible: Ranges; marks: Ranges; letters: Ranges };
  /** Regular expressions over the folded-for-links copy; the same source runs in Postgres (ARE) and JavaScript. */
  links: readonly string[];
  /** Citation and outcome-claim shapes over the same copy as the links (years and percentages pass elsewhere). Never overridden. */
  claims: readonly { name: string; re: string }[];
  confusables: Record<string, string>;
  leet: Record<string, string>;
  /** What "1" maps to, tried in turn. */
  leetOne: readonly string[];
  deny: readonly string[];
  denyPhrases: readonly (readonly string[])[];
  /** What members see for a held slot that has no admitted text. */
  fallbacks: { brand_name: string; course_title: string };
}

export type AdmissionReason = "required" | "unknown-slot" | "control" | "length" | "blank" | "link" | "claim" | "denied";

export type TenantTextAdmission =
  | { ok: true; text: string; version: string; overridden: boolean }
  | { ok: false; reason: AdmissionReason; detail: string; version: string };

export interface TenantTextInput {
  /** The gym the text belongs to; overrides are per gym. */
  orgId: string | null;
  slot: string;
  text: string | null | undefined;
}

/** A LEAD-recorded exception: this exact (normalized) text may use a reserved word in this gym and slot. */
export interface TenantTextOverride {
  orgId: string;
  slot: string;
  text: string;
}

const hex = (cp: number) => `\\u{${cp.toString(16)}}`;
const charClass = (ranges: Ranges) => ranges.map(([a, b]) => (a === b ? hex(a) : `${hex(a)}-${hex(b)}`)).join("");

const nonAscii = (ranges: Ranges) =>
  charClass(ranges.flatMap(([a, b]): [number, number][] => (b < 0x80 ? [] : [[Math.max(a, 0x80), b]])));

function compile(rules: TenantTextRules) {
  const cls = (r: Ranges, flags = "u") => new RegExp(`[${charClass(r)}]`, flags);
  return {
    trimEdges: new RegExp(`^[${charClass(rules.chars.trim)}]+|[${charClass(rules.chars.trim)}]+$`, "gu"),
    refuse: cls(rules.chars.refuse),
    blank: cls(rules.chars.blank, "gu"),
    visible: cls(rules.chars.visible),
    marks: cls(rules.chars.marks, "gu"),
    links: rules.links.map((l) => new RegExp(l)),
    claims: rules.claims.map((c) => ({ name: c.name, re: new RegExp(c.re) })),
    deny: new Set(rules.deny),
    // An ASCII letter next to a letter of another script in the folded copy: an unresolved disguise.
    mixed: new RegExp(`[a-z][${nonAscii(rules.chars.letters)}]|[${nonAscii(rules.chars.letters)}][a-z]`, "u"),
  };
}

const compiled = new WeakMap<TenantTextRules, ReturnType<typeof compile>>();
function compiledFor(rules: TenantTextRules) {
  let c = compiled.get(rules);
  if (!c) compiled.set(rules, (c = compile(rules)));
  return c;
}

/** Lone UTF-16 surrogates cannot reach Postgres text; refuse them as control characters. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const codePoints = (s: string) => [...s].length;
const asciiLower = (s: string) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());

/** The copy the link rules read: NFKC, blanks dropped, ASCII lowercase. */
export function linkCopy(text: string, rules: TenantTextRules = TENANT_TEXT_RULES): string {
  return asciiLower(text.normalize("NFKC").replace(compiledFor(rules).blank, ""));
}

/** The folded copy the reserved-word rules read (before tokenizing). */
export function foldedCopy(text: string, rules: TenantTextRules = TENANT_TEXT_RULES): string {
  const c = compiledFor(rules);
  const split = text.normalize("NFKC").replace(c.blank, "").replace(/([a-z])([A-Z])/g, "$1 $2");
  return [...asciiLower(split).normalize("NFKD").replace(c.marks, "")].map((ch) => rules.confusables[ch] ?? ch).join("");
}

/**
 * Token lists to match, one per reading: plain (symbols separate words), then leet with each
 * reading of "1". A chunk is mapped when it holds a letter or is a single character, so years
 * and percentages stay numbers. Runs of single letters are joined.
 */
export function tokenReadings(folded: string, rules: TenantTextRules = TENANT_TEXT_RULES): string[][] {
  const chunks = folded.match(/[a-z0-9$!|]+/g) ?? [];
  const readings: string[][] = [chunks.flatMap((ch) => ch.match(/[a-z0-9]+/g) ?? [])];
  for (const one of rules.leetOne) {
    readings.push(
      chunks.flatMap((ch) => {
        if (!/[a-z]/.test(ch) && ch.length > 1) return ch.match(/[a-z0-9]+/g) ?? [];
        const mapped = [...ch].map((x) => (x === "1" ? one : (rules.leet[x] ?? x))).join("");
        return mapped.match(/[a-z0-9]+/g) ?? [];
      }),
    );
  }
  return readings.map(joinSingles);
}

function joinSingles(tokens: string[]): string[] {
  const out: string[] = [];
  let run = "";
  // A joined run is marked with "~": reserved terms are also searched inside it (Sol R1 W4).
  const flush = () => {
    if (run) out.push(`~${run}`);
    run = "";
  };
  tokens.forEach((t, i) => {
    const single = /^[a-z]$/.test(t);
    const nextSingle = /^[a-z]$/.test(tokens[i + 1] ?? "");
    const prevSingle = /^[a-z]$/.test(tokens[i - 1] ?? "");
    if (single && (nextSingle || prevSingle)) run += t;
    else {
      flush();
      out.push(t);
    }
  });
  flush();
  return out;
}

/**
 * The first reserved word or phrase found, or null. Whole tokens and token sequences; inside a run of
 * spaced single letters, also any reserved word of three or more letters or any phrase written
 * together ("S C I E N C E B A S E D"). A token that mixes ASCII letters with letters of another
 * script that no confusable maps is refused as "mixed script".
 */
export function reservedTerm(text: string, rules: TenantTextRules = TENANT_TEXT_RULES): string | null {
  const c = compiledFor(rules);
  const folded = foldedCopy(text, rules);
  for (const marked of tokenReadings(folded, rules)) {
    const tokens = marked.map((t) => (t.startsWith("~") ? t.slice(1) : t));
    for (let i = 0; i < tokens.length; i++) {
      if (c.deny.has(tokens[i]!)) return tokens[i]!;
      for (const phrase of rules.denyPhrases) {
        if (phrase.every((w, k) => tokens[i + k] === w)) return phrase.join(" ");
      }
      if (marked[i]!.startsWith("~")) {
        const run = tokens[i]!;
        const word = rules.deny.find((w) => w.length >= 3 && run.includes(w));
        if (word) return word;
        const phrase = rules.denyPhrases.find((p) => run.includes(p.join("")));
        if (phrase) return phrase.join(" ");
      }
    }
  }
  if (c.mixed.test(folded)) return "mixed script";
  return null;
}

/** Admits one tenant text for one slot, or says why not. The returned text is what gets stored. */
export function admitTenantText(
  input: TenantTextInput,
  overrides: readonly TenantTextOverride[] = [],
  rules: TenantTextRules = TENANT_TEXT_RULES,
): TenantTextAdmission {
  const version = rules.version;
  const no = (reason: AdmissionReason, detail: string): TenantTextAdmission => ({ ok: false, reason, detail, version });
  if (!Object.hasOwn(rules.slots, input.slot)) return no("unknown-slot", input.slot);
  const bounds = (rules.slots as Record<string, readonly [number, number]>)[input.slot]!;
  if (input.text === null || input.text === undefined) return no("required", "text is required");
  // Bound the work before normalizing or trimming (Sol R1 W11).
  if (codePoints(input.text) > rules.rawMax) return no("length", `must be ${bounds[0]} to ${bounds[1]} characters`);
  const c = compiledFor(rules);
  if (LONE_SURROGATE.test(input.text)) return no("control", "must not contain control, format or invisible characters");
  const text = input.text.normalize("NFC").replace(c.trimEdges, "");
  if (c.refuse.test(text)) return no("control", "must not contain control, format or invisible characters");
  const n = codePoints(text);
  if (n < bounds[0] || n > bounds[1]) return no("length", `must be ${bounds[0]} to ${bounds[1]} characters`);
  if (n === 0) return { ok: true, text, version, overridden: false };
  if (!c.visible.test(text.replace(c.blank, ""))) return no("blank", "must contain visible text");
  const lc = linkCopy(text, rules);
  if (c.links.some((re) => re.test(lc))) return no("link", "must be plain text, without links, addresses or markup");
  const claim = c.claims.find((x) => x.re.test(lc));
  if (claim) return no("claim", claim.name);
  const overridden = overrides.some((o) => o.orgId === input.orgId && o.slot === input.slot && o.text === text);
  if (!overridden) {
    const term = reservedTerm(text, rules);
    if (term) return no("denied", term);
  }
  return { ok: true, text, version, overridden };
}

/** What members see while a held slot has no admitted text: never the unadmitted text. */
export const TENANT_TEXT_FALLBACKS = TENANT_TEXT_RULES.fallbacks;

export { TENANT_TEXT_RULES };

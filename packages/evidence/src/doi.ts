const DOI_RE = /^10\.\d{4,9}\/\S+$/;

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Normalize a DOI: parse resolver URLs (decode the path once, drop query and fragment),
 * strip `doi:` prefixes, lowercase. Returns null when the input is not a DOI.
 */
export function normalizeDoi(input: string): string | null {
  let s = input.trim();
  if (/^https?:\/\//i.test(s)) {
    let url: URL;
    try {
      url = new URL(s);
    } catch {
      return null;
    }
    if (!/^(dx\.)?doi\.org$/i.test(url.hostname)) return null;
    s = safeDecode(url.pathname.replace(/^\/+/, ""));
  } else {
    s = s.replace(/^doi:\s*/i, "");
  }
  s = s.trim().toLowerCase();
  return DOI_RE.test(s) ? s : null;
}

export function requireDoi(input: string): string {
  const doi = normalizeDoi(input);
  if (!doi) throw new Error(`Not a valid DOI: ${input}`);
  return doi;
}

/** DOIs go in URL paths: keep the slash, encode everything else. */
export function encodeDoiPath(doi: string): string {
  return doi.split("/").map(encodeURIComponent).join("/");
}

const ENTITY = /&(?:#(\d{1,7})|#x([\da-fA-F]{1,6})|(lt|gt|quot|apos|nbsp|amp));/g;
const NAMED: Record<string, string> = { lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", amp: "&" };

function decodeEntity(match: string, dec?: string, hex?: string, name?: string): string {
  if (name) return NAMED[name] ?? match;
  const code = dec ? Number(dec) : Number.parseInt(hex ?? "", 16);
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
}

// One tag grammar (XML-like): "<", an optional "/", an element name (optionally namespaced),
// attributes that each carry a quoted value, an optional "/", then ">". Anything else that
// starts with "<" ("P<alpha; pooled effect>0.5", "n<5") is text (Sol R2 R05).
const NAME = String.raw`[A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?`;
const TAG = new RegExp(String.raw`<\/?${NAME}(?:\s+${NAME}\s*=\s*(?:"[^"<]*"|'[^'<]*'))*\s*\/?>`, "y");
const DECLARATION = /<![A-Za-z][^<>]*>/y;

// Escaped markup ("&lt;jats:p&gt;", "&#60;break/&#62;"), which some publishers double-encode.
// Delimiters and quotes may be named or numeric entities. Only namespaced names or known
// HTML/JATS element names count, with the same attribute grammar, so an escaped comparison
// such as "x &lt;y and z &gt; 0" stays text (Sol R2 R04).
const LT = String.raw`(?:&lt;|&#0*60;|&#x0*3c;)`;
const GT = String.raw`(?:&gt;|&#0*62;|&#x0*3e;)`;
const DQ = String.raw`(?:"|&quot;|&#0*34;|&#x0*22;)`;
const SQ = String.raw`(?:'|&apos;|&#0*39;|&#x0*27;)`;
const KNOWN = [
  "p", "i", "b", "u", "em", "strong", "small", "sup", "sub", "br", "hr", "span", "div", "a", "h[1-6]", "ul", "ol", "li",
  "sec", "title", "break", "italic", "bold", "sc", "underline", "overline", "strike", "monospace", "roman", "sans-serif",
  "list", "list-item", "label", "caption", "xref", "ext-link", "uri", "email", "inline-formula", "disp-formula",
  "named-content", "styled-content", "abstract", "trans-abstract", "fig", "table-wrap", "table", "thead", "tbody", "tr",
  "td", "th", "graphic", "inline-graphic", "def-list", "def-item", "term", "def", "kwd", "kwd-group",
].join("|");
const ESC_VALUE = String.raw`(?:${DQ}(?:(?!${DQ})[^<>])*${DQ}|${SQ}(?:(?!${SQ})[^<>])*${SQ})`;
const ESCAPED_TAG = new RegExp(
  String.raw`${LT}\/?(?:[A-Za-z_][\w.-]*:[A-Za-z_][\w.-]*|(?:${KNOWN})(?![\w.:-]))(?:\s+${NAME}\s*=\s*${ESC_VALUE})*\s*\/?${GT}`,
  "gi",
);

/** Decodes entities once in a run of text, after removing escaped markup. */
const textRun = (t: string) => t.replace(ESCAPED_TAG, " ").replace(ENTITY, decodeEntity);

function matchAt(re: RegExp, text: string, i: number): number {
  re.lastIndex = i;
  return re.test(text) ? re.lastIndex : -1;
}

/**
 * Plain text from an abstract or title. A small tokenizer: comments, processing instructions
 * (through "?>") and declarations are dropped; CDATA bodies are kept literally; a tag must
 * match the full tag grammar, so any other "<" or ">" ("p < 0.05", "(<93°)") is text. Text
 * runs are decoded once (Sol R1 and R2 on PR #24).
 */
export function stripTags(text: string): string {
  const out: string[] = [];
  let run = "";
  const flush = (replacement: string) => {
    out.push(textRun(run), replacement);
    run = "";
  };
  let i = 0;
  while (i < text.length) {
    if (text[i] !== "<") {
      run += text[i++];
      continue;
    }
    if (text.startsWith("<!--", i)) {
      const end = text.indexOf("-->", i + 4);
      flush(" ");
      i = end < 0 ? text.length : end + 3;
      continue;
    }
    if (text.startsWith("<![CDATA[", i)) {
      const end = text.indexOf("]]>", i + 9);
      flush(end < 0 ? text.slice(i + 9) : text.slice(i + 9, end));
      i = end < 0 ? text.length : end + 3;
      continue;
    }
    let end = -1;
    if (text.startsWith("<?", i)) {
      const close = text.indexOf("?>", i + 2);
      end = close < 0 ? -1 : close + 2;
    } else if (text[i + 1] === "!") end = matchAt(DECLARATION, text, i);
    else end = matchAt(TAG, text, i);
    if (end > 0) {
      flush(" ");
      i = end;
      continue;
    }
    run += text[i++];
  }
  flush("");
  return out.join("").replace(/\s+/g, " ").trim();
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/** Map publication-type labels (PubMed, Europe PMC) to retraction flags. */
export function retractionFromPubTypes(types: readonly string[]): { isRetracted: boolean; isRetractionNotice: boolean } {
  return {
    isRetracted: types.some((t) => /^retracted publication$/i.test(t.trim())),
    isRetractionNotice: types.some((t) => /^retraction of publication$/i.test(t.trim())),
  };
}

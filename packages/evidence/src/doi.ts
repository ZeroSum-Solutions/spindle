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

// Escaped markup ("&lt;jats:p&gt;"), which some publishers double-encode: only namespaced
// or known HTML/JATS element names, with well-formed attributes, so an escaped comparison
// such as "x &lt;y and z &gt; 0" stays text.
const ESCAPED_TAG = new RegExp(
  "&lt;/?(?:[A-Za-z][\\w.-]*:[A-Za-z][\\w.-]*|" +
    "(?:p|i|b|u|em|strong|sup|sub|sc|br|hr|span|div|a|h[1-6]|ul|ol|li|italic|bold|underline|title|sec|label|list|list-item|abstract|xref|ext-link|inline-formula|named-content|monospace|small)" +
    ")(?:\\s+[\\w:.-]+\\s*=\\s*(?:\"[^\"<>]*\"|'[^'<>]*'|&quot;(?:(?!&quot;)[^<>])*&quot;))*\\s*/?&gt;",
  "gi",
);

/** Decodes entities once in a run of text, after removing escaped markup. */
const textRun = (t: string) => t.replace(ESCAPED_TAG, " ").replace(ENTITY, decodeEntity);

/** Index just past the ">" that ends a tag starting at i, skipping quoted attribute values; -1 if none. */
function tagEnd(text: string, i: number): number {
  let quote: string | null = null;
  for (let j = i + 1; j < text.length; j++) {
    const c = text[j]!;
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === ">") return j + 1;
    else if (c === "<") return -1;
  }
  return -1;
}

/**
 * Plain text from an abstract or title. A small tokenizer: comments, processing instructions
 * and doctypes are dropped; CDATA bodies are kept literally; a tag is "<" or "</" then a
 * letter, ending at the first ">" outside quoted attributes. Any other "<" or ">" ("p < 0.05",
 * "(<93°)") is text. Text runs are decoded once (Sol R01–R04 on PR #24).
 */
export function stripTags(text: string): string {
  const out: string[] = [];
  let run = "";
  const flush = () => {
    out.push(textRun(run));
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
      flush();
      out.push(" ");
      i = end < 0 ? text.length : end + 3;
      continue;
    }
    if (text.startsWith("<![CDATA[", i)) {
      const end = text.indexOf("]]>", i + 9);
      flush();
      out.push(end < 0 ? text.slice(i + 9) : text.slice(i + 9, end));
      i = end < 0 ? text.length : end + 3;
      continue;
    }
    if (/^<(?:\/?[A-Za-z]|[?!][A-Za-z?])/.test(text.slice(i, i + 3))) {
      const end = tagEnd(text, i);
      if (end > 0) {
        flush();
        out.push(" ");
        i = end;
        continue;
      }
    }
    run += text[i++];
  }
  flush();
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

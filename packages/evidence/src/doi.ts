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

export function stripTags(text: string): string {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
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

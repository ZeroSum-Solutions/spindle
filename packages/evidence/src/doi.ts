/** Strip URL prefixes and lowercase. Returns null when the input is not a DOI. */
export function normalizeDoi(input: string): string | null {
  const cleaned = input
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .toLowerCase();
  return /^10\.\d{4,9}\/\S+$/.test(cleaned) ? cleaned : null;
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

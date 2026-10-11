/**
 * The doi.org link for a DOI. DOIs may contain "#", "?" and other reserved characters,
 * so each path segment is percent-encoded; "/" separators stay.
 */
export function doiHref(doi: string): string {
  return `https://doi.org/${doi.split("/").map(encodeURIComponent).join("/")}`;
}

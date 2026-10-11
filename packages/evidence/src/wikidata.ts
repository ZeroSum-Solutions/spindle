import { z } from "zod";
import type { EvidenceContext } from "./context";

const ENDPOINT = "https://query.wikidata.org/sparql";

const value = z.object({ value: z.string() });
const schema = z.object({
  results: z.object({
    bindings: z.array(
      z.object({
        item: value,
        itemLabel: value.optional(),
        itemDescription: value.optional(),
        uberon: value,
        ta98: value.optional(),
        ta2: value.optional(),
      }),
    ),
  }),
});

export interface AnatomyItem {
  qid: string;
  label?: string;
  description?: string;
  /** Always in the form `UBERON:0001103`. */
  uberonId: string;
  /** Terminologia Anatomica 98 identifiers (P1323). */
  ta98: string[];
  /** Terminologia Anatomica 2 identifiers (P7173). */
  ta2: string[];
}

/** Accepts `UBERON:0001103`, `UBERON_0001103` or `0001103`. Returns the 7 digits. */
export function parseUberonId(input: string): string {
  const m = input.trim().match(/^(?:UBERON[:_])?(\d{7})$/i);
  if (!m?.[1]) throw new Error(`Not a valid Uberon ID: ${input}`);
  return m[1];
}

export function buildUberonQuery(digits: string[]): string {
  const values = digits.map((d) => `"${d}"`).join(" ");
  return `SELECT ?item ?itemLabel ?itemDescription ?uberon ?ta98 ?ta2 WHERE {
  VALUES ?uberon { ${values} }
  ?item wdt:P1554 ?uberon .
  OPTIONAL { ?item wdt:P1323 ?ta98 }
  OPTIONAL { ?item wdt:P7173 ?ta2 }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;
}

export async function lookupAnatomyByUberon(ctx: EvidenceContext, ids: string[]): Promise<AnatomyItem[]> {
  if (ids.length === 0) return [];
  ctx.requireEmail(); // Wikimedia's User-Agent policy asks for contact details
  // IDs are reduced to 7 digits first, so nothing user-supplied reaches the query text.
  const query = buildUberonQuery([...new Set(ids.map(parseUberonId))]);
  const url = `${ENDPOINT}?${new URLSearchParams({ query, format: "json" })}`;
  const data = await ctx.http.fetchJson(url, schema, {
    userAgent: ctx.userAgent(),
    headers: { Accept: "application/sparql-results+json" },
  });
  const byQid = new Map<string, AnatomyItem>();
  for (const b of data.results.bindings) {
    const qid = b.item.value.split("/").pop() ?? b.item.value;
    const item: AnatomyItem = byQid.get(qid) ?? {
      qid,
      label: b.itemLabel?.value,
      description: b.itemDescription?.value,
      uberonId: `UBERON:${b.uberon.value}`,
      ta98: [],
      ta2: [],
    };
    if (b.ta98 && !item.ta98.includes(b.ta98.value)) item.ta98.push(b.ta98.value);
    if (b.ta2 && !item.ta2.includes(b.ta2.value)) item.ta2.push(b.ta2.value);
    byQid.set(qid, item);
  }
  return [...byQid.values()];
}

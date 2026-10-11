import { z } from "zod";
import type { EvidenceContext } from "./context";
import { encodeDoiPath, normalizeDoi } from "./doi";
import type { WorkSummary } from "./types";

const BASE = "https://api.openalex.org/works";
const SELECT = "id,doi,title,publication_year,type,is_retracted,cited_by_count,open_access,best_oa_location,primary_location,ids";

const workSchema = z.object({
  id: z.string(),
  doi: z.string().nullish(),
  title: z.string().nullish(),
  publication_year: z.number().nullish(),
  type: z.string().nullish(),
  is_retracted: z.boolean().nullish(),
  cited_by_count: z.number().nullish(),
  open_access: z.object({ is_oa: z.boolean(), oa_status: z.string().nullish(), oa_url: z.string().nullish() }).nullish(),
  best_oa_location: z.object({ license: z.string().nullish(), landing_page_url: z.string().nullish() }).nullish(),
  primary_location: z.object({ source: z.object({ display_name: z.string().nullish() }).nullish() }).nullish(),
  ids: z.object({ pmid: z.string().nullish() }).nullish(),
});

const listSchema = z.object({ meta: z.object({ count: z.number() }), results: z.array(workSchema) });

export interface OpenAlexWork extends WorkSummary {
  openalexId: string;
  oaStatus?: string;
}

function normalize(w: z.output<typeof workSchema>): OpenAlexWork {
  const pmid = w.ids?.pmid?.match(/(\d+)\/?$/)?.[1];
  return {
    source: "openalex",
    openalexId: w.id,
    doi: w.doi ? (normalizeDoi(w.doi) ?? undefined) : undefined,
    pmid,
    title: w.title ?? "(untitled)",
    year: w.publication_year ?? undefined,
    journal: w.primary_location?.source?.display_name ?? undefined,
    isReview: w.type === "review",
    isRetracted: w.is_retracted ?? undefined,
    citedByCount: w.cited_by_count ?? undefined,
    oaStatus: w.open_access?.oa_status ?? undefined,
    oa: {
      isOa: w.open_access?.is_oa ?? false,
      license: w.best_oa_location?.license ?? undefined,
      url: w.open_access?.oa_url ?? undefined,
    },
  };
}

export interface OpenAlexSearchOptions {
  max?: number;
  /** For example `{ type: "review", from_publication_date: "2018-01-01", is_oa: "true" }`. */
  filter?: Record<string, string>;
  sort?: string;
}

export async function searchOpenAlex(
  ctx: EvidenceContext,
  query: string,
  opts: OpenAlexSearchOptions = {},
): Promise<{ total: number; works: OpenAlexWork[] }> {
  const filter = Object.entries(opts.filter ?? {})
    .map(([k, v]) => `${k}:${v}`)
    .join(",");
  const p = new URLSearchParams({
    search: query,
    "per-page": String(opts.max ?? 20),
    select: SELECT,
    mailto: ctx.requireEmail(),
  });
  if (filter) p.set("filter", filter);
  if (opts.sort) p.set("sort", opts.sort);
  const data = await ctx.http.fetchJson(`${BASE}?${p}`, listSchema, { userAgent: ctx.userAgent() });
  return { total: data.meta.count, works: data.results.map(normalize) };
}

export async function getOpenAlexByDoi(ctx: EvidenceContext, doi: string): Promise<OpenAlexWork | null> {
  const p = new URLSearchParams({ select: SELECT, mailto: ctx.requireEmail() });
  const url = `${BASE}/doi:${encodeDoiPath(doi)}?${p}`;
  const data = await ctx.http.fetchJson(url, workSchema, { userAgent: ctx.userAgent(), nullStatuses: [404] });
  return data ? normalize(data) : null;
}

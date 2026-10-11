import { z } from "zod";
import type { EvidenceContext } from "./context";
import { normalizeDoi, requireDoi, retractionFromPubTypes, stripTags, truncate } from "./doi";
import type { WorkSummary } from "./types";

const BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";

const resultSchema = z.object({
  id: z.string(),
  pmid: z.string().optional(),
  doi: z.string().optional(),
  title: z.string(),
  pubYear: z.string().regex(/^\d{4}$/).optional(),
  abstractText: z.string().optional(),
  isOpenAccess: z.string().optional(),
  license: z.string().optional(),
  citedByCount: z.coerce.number().optional(),
  journalInfo: z.object({ journal: z.object({ title: z.string().optional() }).optional() }).optional(),
  pubTypeList: z.object({ pubType: z.array(z.string()) }).optional(),
});

const responseSchema = z.object({
  hitCount: z.number(),
  resultList: z.object({ result: z.array(resultSchema) }),
});

export interface EuropePmcWork extends WorkSummary {
  abstract?: string;
}

export async function searchEuropePmc(
  ctx: EvidenceContext,
  query: string,
  opts: { max?: number; openAccessOnly?: boolean; reviewsOnly?: boolean; maxAbstractChars?: number } = {},
): Promise<{ total: number; works: EuropePmcWork[] }> {
  let q = query;
  if (opts.reviewsOnly) q += ' AND (PUB_TYPE:"systematic-review" OR PUB_TYPE:"Review" OR PUB_TYPE:"Meta-Analysis")';
  if (opts.openAccessOnly) q += " AND OPEN_ACCESS:y";
  const p = new URLSearchParams({
    query: q,
    format: "json",
    resultType: "core",
    pageSize: String(opts.max ?? 20),
  });
  const email = ctx.env.SPINDLE_CONTACT_EMAIL?.trim();
  if (email) p.set("email", email);
  const data = await ctx.http.fetchJson(`${BASE}?${p}`, responseSchema, { userAgent: ctx.userAgent() });
  const maxChars = opts.maxAbstractChars ?? 600;
  const works = data.resultList.result.map((r): EuropePmcWork => {
    const types = r.pubTypeList?.pubType ?? [];
    return {
      source: "europepmc",
      pmid: r.pmid,
      doi: r.doi ? (normalizeDoi(r.doi) ?? undefined) : undefined,
      title: stripTags(r.title).replace(/\.$/, ""),
      year: r.pubYear ? Number(r.pubYear) : undefined,
      journal: r.journalInfo?.journal?.title,
      isReview: types.some((t) => /review|meta-analysis/i.test(t) && !/retract/i.test(t)),
      ...retractionFromPubTypes(types),
      citedByCount: r.citedByCount,
      oa: { isOa: r.isOpenAccess === "Y", license: r.license },
      abstract: r.abstractText ? truncate(stripTags(r.abstractText), maxChars) : undefined,
    };
  });
  return { total: data.hitCount, works };
}

export async function getEuropePmcByDoi(ctx: EvidenceContext, doi: string): Promise<EuropePmcWork | null> {
  const clean = requireDoi(doi);
  const { works } = await searchEuropePmc(ctx, `DOI:"${clean.replace(/["\\]/g, "")}"`, { max: 1 });
  const hit = works[0];
  return hit && hit.doi === clean ? hit : null;
}

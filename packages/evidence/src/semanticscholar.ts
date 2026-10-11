import { z } from "zod";
import type { EvidenceContext } from "./context";
import { encodeDoiPath } from "./doi";

const FIELDS = "title,year,tldr,citationCount,isOpenAccess";

const schema = z.object({
  paperId: z.string(),
  title: z.string().nullish(),
  year: z.number().nullish(),
  citationCount: z.number().nullish(),
  isOpenAccess: z.boolean().nullish(),
  tldr: z.object({ text: z.string().nullish() }).nullish(),
});

export interface SemanticScholarPaper {
  paperId: string;
  title?: string;
  year?: number;
  citationCount?: number;
  isOpenAccess?: boolean;
  tldr?: string;
}

/** Returns null when Semantic Scholar has no paper for the DOI. Key is optional (S2_API_KEY). */
export async function getSemanticScholarByDoi(
  ctx: EvidenceContext,
  doi: string,
): Promise<SemanticScholarPaper | null> {
  const key = ctx.env.S2_API_KEY?.trim();
  const url = `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeDoiPath(doi)}?fields=${FIELDS}`;
  const data = await ctx.http.fetchJson(url, schema, {
    userAgent: ctx.userAgent(),
    headers: key ? { "x-api-key": key } : undefined,
    nullStatuses: [404],
  });
  if (!data) return null;
  return {
    paperId: data.paperId,
    title: data.title ?? undefined,
    year: data.year ?? undefined,
    citationCount: data.citationCount ?? undefined,
    isOpenAccess: data.isOpenAccess ?? undefined,
    tldr: data.tldr?.text ?? undefined,
  };
}

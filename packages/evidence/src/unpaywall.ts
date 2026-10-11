import { z } from "zod";
import type { EvidenceContext } from "./context";
import { encodeDoiPath, requireDoi } from "./doi";
import type { OaInfo } from "./types";

const schema = z.object({
  doi: z.string(),
  is_oa: z.boolean(),
  oa_status: z.string().nullish(),
  best_oa_location: z
    .object({
      license: z.string().nullish(),
      url: z.string().nullish(),
      url_for_pdf: z.string().nullish(),
      version: z.string().nullish(),
      host_type: z.string().nullish(),
    })
    .nullish(),
});

export interface UnpaywallResult extends OaInfo {
  doi: string;
  oaStatus?: string;
  version?: string;
  hostType?: string;
}

/** Returns null when Unpaywall does not know the DOI. */
export async function getUnpaywall(ctx: EvidenceContext, doi: string): Promise<UnpaywallResult | null> {
  const url = `https://api.unpaywall.org/v2/${encodeDoiPath(requireDoi(doi))}?email=${encodeURIComponent(ctx.requireEmail())}`;
  const data = await ctx.http.fetchJson(url, schema, { userAgent: ctx.userAgent(), nullStatuses: [404] });
  if (!data) return null;
  const loc = data.best_oa_location;
  return {
    doi: data.doi.toLowerCase(),
    isOa: data.is_oa,
    oaStatus: data.oa_status ?? undefined,
    license: loc?.license ?? undefined,
    url: loc?.url ?? undefined,
    version: loc?.version ?? undefined,
    hostType: loc?.host_type ?? undefined,
  };
}

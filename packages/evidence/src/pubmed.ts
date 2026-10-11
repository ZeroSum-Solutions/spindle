import { z } from "zod";
import type { EvidenceContext } from "./context";
import { normalizeDoi } from "./doi";
import type { WorkSummary } from "./types";

const BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const REVIEW_FILTER = "(review[pt] OR systematic[sb] OR meta-analysis[pt])";

const searchSchema = z.object({
  esearchresult: z.object({ count: z.string(), idlist: z.array(z.string()) }),
});

const itemSchema = z.object({
  uid: z.string(),
  title: z.string(),
  pubdate: z.string().optional(),
  fulljournalname: z.string().optional(),
  source: z.string().optional(),
  pubtype: z.array(z.string()).default([]),
  articleids: z.array(z.object({ idtype: z.string(), value: z.string() })).default([]),
});

const summarySchema = z.object({ result: z.record(z.string(), z.unknown()) });

function params(ctx: EvidenceContext, extra: Record<string, string>): URLSearchParams {
  const p = new URLSearchParams({ retmode: "json", tool: "spindle", ...extra });
  const email = ctx.env.SPINDLE_CONTACT_EMAIL?.trim();
  if (email) p.set("email", email);
  const key = ctx.env.NCBI_API_KEY?.trim();
  if (key) p.set("api_key", key);
  return p;
}

/** 3 requests per second without a key, 10 with one. */
function interval(ctx: EvidenceContext): number {
  return ctx.env.NCBI_API_KEY?.trim() ? 110 : 340;
}

export interface PubMedSearchResult {
  total: number;
  pmids: string[];
}

export async function searchPubMed(
  ctx: EvidenceContext,
  query: string,
  opts: { max?: number; reviewsOnly?: boolean } = {},
): Promise<PubMedSearchResult> {
  const term = opts.reviewsOnly === false ? query : `(${query}) AND ${REVIEW_FILTER}`;
  const p = params(ctx, { db: "pubmed", term, retmax: String(opts.max ?? 20), sort: "relevance" });
  const data = await ctx.http.fetchJson(`${BASE}/esearch.fcgi?${p}`, searchSchema, {
    userAgent: ctx.userAgent(),
    minIntervalMs: interval(ctx),
  });
  return { total: Number(data.esearchresult.count), pmids: data.esearchresult.idlist };
}

function parseYear(pubdate: string | undefined): number | undefined {
  const m = pubdate?.match(/^\d{4}/);
  return m ? Number(m[0]) : undefined;
}

export async function getPubMedSummaries(ctx: EvidenceContext, pmids: string[]): Promise<WorkSummary[]> {
  if (pmids.length === 0) return [];
  const p = params(ctx, { db: "pubmed", id: pmids.join(",") });
  const data = await ctx.http.fetchJson(`${BASE}/esummary.fcgi?${p}`, summarySchema, {
    userAgent: ctx.userAgent(),
    minIntervalMs: interval(ctx),
  });
  const out: WorkSummary[] = [];
  for (const id of pmids) {
    const parsed = itemSchema.safeParse(data.result[id]);
    if (!parsed.success) continue; // unknown PMIDs come back as an error object
    const it = parsed.data;
    const doiId = it.articleids.find((a) => a.idtype === "doi")?.value;
    const doi = doiId ? (normalizeDoi(doiId) ?? undefined) : undefined;
    out.push({
      source: "pubmed",
      pmid: it.uid,
      doi,
      title: it.title.replace(/\.$/, ""),
      year: parseYear(it.pubdate),
      journal: it.fulljournalname ?? it.source,
      isReview: it.pubtype.some((t) => /review|meta-analysis/i.test(t)),
      oa: { isOa: it.articleids.some((a) => a.idtype === "pmc") },
    });
  }
  return out;
}

export async function getPubMedByPmid(ctx: EvidenceContext, pmid: string): Promise<WorkSummary | null> {
  return (await getPubMedSummaries(ctx, [pmid]))[0] ?? null;
}

import { z } from "zod";
import type { EvidenceContext } from "./context";
import { EvidenceValidationError, sanitize } from "./http";
import { normalizeDoi, retractionFromPubTypes } from "./doi";
import type { WorkSummary } from "./types";

const BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const REVIEW_FILTER = "(review[pt] OR systematic[sb] OR meta-analysis[pt])";

const searchSchema = z.object({
  esearchresult: z.object({ count: z.string().regex(/^\d+$/), idlist: z.array(z.string().regex(/^\d+$/)) }),
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

const unknownPmid = z.object({ uid: z.string(), error: z.string().regex(/invalid|not found|cannot get document summary/i) });

const summarySchema = z.object({ result: z.record(z.string(), z.unknown()) });

/** NCBI asks distributed software to send `tool` and a developer `email`. */
function params(ctx: EvidenceContext, extra: Record<string, string>): URLSearchParams {
  const p = new URLSearchParams({ retmode: "json", tool: "spindle", email: ctx.requireEmail(), ...extra });
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
  if (!pmids.every((id) => /^\d+$/.test(id))) throw new Error("PMIDs must be numeric strings");
  const p = params(ctx, { db: "pubmed", id: pmids.join(",") });
  const data = await ctx.http.fetchJson(`${BASE}/esummary.fcgi?${p}`, summarySchema, {
    userAgent: ctx.userAgent(),
    minIntervalMs: interval(ctx),
  });
  const out: WorkSummary[] = [];
  for (const id of pmids) {
    const raw = data.result[id];
    if (unknownPmid.safeParse(raw).success) continue; // NCBI answers unknown PMIDs with { uid, error }
    const parsed = itemSchema.safeParse(raw);
    if (!parsed.success) {
      throw new EvidenceValidationError(`PubMed record ${id} is malformed: ${sanitize(parsed.error.message).slice(0, 300)}`, `esummary:${id}`);
    }
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
      isReview: it.pubtype.some((t) => /review|meta-analysis/i.test(t) && !/retract/i.test(t)),
      ...retractionFromPubTypes(it.pubtype),
      oa: { isOa: it.articleids.some((a) => a.idtype === "pmc") },
    });
  }
  return out;
}

export async function getPubMedByPmid(ctx: EvidenceContext, pmid: string): Promise<WorkSummary | null> {
  return (await getPubMedSummaries(ctx, [pmid]))[0] ?? null;
}

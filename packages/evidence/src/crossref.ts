import { z } from "zod";
import type { EvidenceContext } from "./context";
import { encodeDoiPath, stripTags } from "./doi";

const relationSchema = z.record(z.string(), z.array(z.object({ id: z.string().optional() }).passthrough()));

const messageSchema = z.object({
  DOI: z.string(),
  title: z.array(z.string()).default([]),
  "container-title": z.array(z.string()).default([]),
  type: z.string().optional(),
  issued: z.object({ "date-parts": z.array(z.array(z.number().nullable())) }).optional(),
  relation: relationSchema.optional(),
  "update-to": z.array(z.object({ type: z.string(), DOI: z.string().optional() })).optional(),
  "updated-by": z.array(z.object({ type: z.string(), DOI: z.string().optional() })).optional(),
});

const responseSchema = z.object({ message: messageSchema });

export interface CrossrefWork {
  doi: string;
  title: string;
  journal?: string;
  year?: number;
  type?: string;
  /** Another record (a retraction notice) says this work was retracted. */
  isRetracted: boolean;
  retractionNotices: string[];
  /** This record is itself a retraction notice for another work. */
  isRetractionNotice: boolean;
}

const isRetraction = (t: string): boolean => /retract/i.test(t);

export function normalizeCrossref(m: z.output<typeof messageSchema>): CrossrefWork {
  const updatedBy = (m["updated-by"] ?? []).filter((u) => isRetraction(u.type));
  const relationKeys = Object.entries(m.relation ?? {}).filter(([k]) => /is-retracted-by/i.test(k));
  const notices = [
    ...updatedBy.map((u) => u.DOI).filter((d): d is string => !!d),
    ...relationKeys.flatMap(([, v]) => v.map((r) => r.id).filter((d): d is string => !!d)),
  ];
  return {
    doi: m.DOI.toLowerCase(),
    title: stripTags(m.title[0] ?? ""),
    journal: m["container-title"][0],
    year: m.issued?.["date-parts"][0]?.[0] ?? undefined,
    type: m.type,
    isRetracted: updatedBy.length > 0 || relationKeys.length > 0,
    retractionNotices: [...new Set(notices)],
    isRetractionNotice: (m["update-to"] ?? []).some((u) => isRetraction(u.type)),
  };
}

/** Returns null when Crossref has no record for the DOI. */
export async function getCrossrefWork(ctx: EvidenceContext, doi: string): Promise<CrossrefWork | null> {
  ctx.requireEmail(); // Crossref routes identified clients to its polite pool
  const url = `https://api.crossref.org/works/${encodeDoiPath(doi)}`;
  const data = await ctx.http.fetchJson(url, responseSchema, { userAgent: ctx.userAgent(), nullStatuses: [404] });
  return data ? normalizeCrossref(data.message) : null;
}

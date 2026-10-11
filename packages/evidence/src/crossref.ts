import { z } from "zod";
import type { EvidenceContext } from "./context";
import { encodeDoiPath, requireDoi, stripTags } from "./doi";

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
  abstract: z.string().optional(),
});

const responseSchema = z.object({ message: messageSchema });

export type RetractionKind = "retraction" | "withdrawal" | "removal";

export interface CrossrefWork {
  doi: string;
  title: string;
  journal?: string;
  year?: number;
  type?: string;
  /** An adverse update or title marker says this work was retracted, withdrawn or removed. */
  isRetracted: boolean;
  /** Why it is flagged. Withdrawals (never formally published) differ from retractions. */
  retractionKind?: RetractionKind;
  retractionNotices: string[];
  /** Where the flag came from: update types, relation keys or the title marker. */
  retractionEvidence: string[];
  /** This record is itself a retraction notice for another work. */
  isRetractionNotice: boolean;
  /** The deposited abstract (JATS tags stripped), when the publisher sent one. */
  abstract?: string;
}

function kindOf(label: string): RetractionKind | null {
  if (/retract/i.test(label)) return "retraction";
  if (/withdraw/i.test(label)) return "withdrawal";
  if (/removal/i.test(label)) return "removal";
  return null;
}

/** Anchored markers only: "RETRACTED: ...", "[Withdrawn] ...". A title that merely mentions the word is ignored. */
const MARKERS: Record<string, RetractionKind> = { retracted: "retraction", withdrawn: "withdrawal", removed: "removal" };

// Inline formatting a publisher may wrap around a marker, literal or escaped (once or twice).
const LT = /&(?:amp;)?(?:lt|#0*60|#x0*3c);/gi;
const GT = /&(?:amp;)?(?:gt|#0*62|#x0*3e);/gi;
const FORMATTING = /<\/?(?:[A-Za-z_][\w.-]*:)?(?:i|b|u|em|strong|italic|bold|sc|span|sup|sub|small|underline)(?:\s[^<>]*)?\/?>/gi;

/** For marker detection only (Sol R4 R10): the returned title keeps its literal text. */
export function markerText(title: string): string {
  return title.replace(LT, "<").replace(GT, ">").replace(FORMATTING, "");
}

function titleKind(title: string): RetractionKind | null {
  const m = markerText(title).match(/^\s*[[(]?\s*(retracted|withdrawn|removed)\b\s*[\]):.-]/i);
  return m?.[1] ? (MARKERS[m[1].toLowerCase()] ?? null) : null;
}

const KIND_RANK: RetractionKind[] = ["retraction", "withdrawal", "removal"];

export function normalizeCrossref(m: z.output<typeof messageSchema>): CrossrefWork {
  const title = stripTags(m.title[0] ?? "");
  const updates = (m["updated-by"] ?? []).flatMap((u) => {
    const kind = kindOf(u.type);
    return kind ? [{ kind, doi: u.DOI, evidence: `updated-by:${u.type}` }] : [];
  });
  const relations = Object.entries(m.relation ?? {}).flatMap(([key, vals]) =>
    /is-retracted-by/i.test(key) ? vals.map((v) => ({ kind: "retraction" as const, doi: v.id, evidence: `relation:${key}` })) : [],
  );
  const marker = titleKind(title);
  const hits = [...updates, ...relations, ...(marker ? [{ kind: marker, doi: undefined, evidence: `title:${marker}` }] : [])];
  const kind = KIND_RANK.find((k) => hits.some((h) => h.kind === k));
  return {
    doi: m.DOI.toLowerCase(),
    title,
    journal: m["container-title"][0],
    year: m.issued?.["date-parts"][0]?.[0] ?? undefined,
    type: m.type,
    isRetracted: hits.length > 0,
    retractionKind: kind,
    retractionNotices: [...new Set(hits.map((h) => h.doi).filter((d): d is string => !!d))],
    retractionEvidence: [...new Set(hits.map((h) => h.evidence))],
    isRetractionNotice: (m["update-to"] ?? []).some((u) => kindOf(u.type) !== null),
    ...(m.abstract ? { abstract: stripTags(m.abstract) } : {}),
  };
}

/** Returns null when Crossref has no record for the DOI. */
export async function getCrossrefWork(ctx: EvidenceContext, doi: string): Promise<CrossrefWork | null> {
  ctx.requireEmail(); // Crossref routes identified clients to its polite pool
  const url = `https://api.crossref.org/works/${encodeDoiPath(requireDoi(doi))}`;
  const data = await ctx.http.fetchJson(url, responseSchema, { userAgent: ctx.userAgent(), nullStatuses: [404] });
  return data ? normalizeCrossref(data.message) : null;
}

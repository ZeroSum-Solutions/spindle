import type { EvidenceContext } from "./context";
import { getCrossrefWork, type CrossrefWork } from "./crossref";
import { requireDoi } from "./doi";
import { getOpenAlexByDoi, type OpenAlexWork } from "./openalex";
import type { OaInfo, SourceCheck } from "./types";
import { getUnpaywall, type UnpaywallResult } from "./unpaywall";

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

type Settled<T> = { ok: true; value: T | null } | { ok: false; error: string };

async function settle<T>(p: Promise<T | null>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await p };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

/**
 * Verification receipt for one DOI: does it exist (Crossref), is it retracted
 * (Crossref notices + OpenAlex flag), and what is its open-access license (Unpaywall).
 * A failed service never reads as "clean": it adds an issue and lowers the status.
 */
export async function verifySource(ctx: EvidenceContext, rawDoi: string): Promise<SourceCheck> {
  const doi = requireDoi(rawDoi);
  ctx.requireEmail(); // fail loudly, not as three network errors
  const [cr, oa, up] = await Promise.all([
    settle<CrossrefWork>(getCrossrefWork(ctx, doi)),
    settle<OpenAlexWork>(getOpenAlexByDoi(ctx, doi)),
    settle<UnpaywallResult>(getUnpaywall(ctx, doi)),
  ]);

  const issues: string[] = [];
  const retractionSources: string[] = [];
  if (!cr.ok) issues.push(`crossref failed: ${cr.error}`);
  else if (!cr.value) issues.push("crossref has no record for this DOI");
  if (!oa.ok) issues.push(`openalex failed: ${oa.error}`);
  else if (!oa.value) issues.push("openalex has no record for this DOI");
  if (!up.ok) issues.push(`unpaywall failed: ${up.error}`);

  const crossref = cr.ok ? cr.value : null;
  const openalex = oa.ok ? oa.value : null;
  const unpaywall = up.ok ? up.value : null;

  if (crossref?.isRetracted) retractionSources.push("crossref");
  if (openalex?.isRetracted) retractionSources.push("openalex");
  if (crossref?.isRetractionNotice) issues.push("this DOI is a retraction notice, not the retracted work");

  const license = unpaywall?.license ?? openalex?.oa.license;
  const oaInfo: OaInfo = {
    isOa: unpaywall?.isOa ?? openalex?.oa.isOa ?? false,
    ...(license ? { license } : {}),
    ...((unpaywall?.url ?? openalex?.oa.url) ? { url: unpaywall?.url ?? openalex?.oa.url } : {}),
  };

  const retracted = retractionSources.length > 0;
  const exists = crossref !== null;
  const status = retracted || crossref?.isRetractionNotice ? "flagged" : exists && cr.ok && oa.ok ? "verified" : "unverified";

  return {
    doi,
    checkedAt: ctx.now().toISOString(),
    status,
    exists,
    title: crossref?.title || openalex?.title,
    retracted,
    retractionSources,
    oa: oaInfo,
    answered: { crossref: crossref !== null, openalex: openalex !== null, unpaywall: unpaywall !== null },
    issues,
  };
}

import type { EvidenceContext } from "./context";
import { getCrossrefWork } from "./crossref";
import { normalizeDoi, requireDoi } from "./doi";
import { sanitize } from "./http";
import { getOpenAlexByDoi } from "./openalex";
import type { OaInfo, SourceCheck } from "./types";
import { getUnpaywall } from "./unpaywall";

type Settled<T> = { ok: true; value: T | null } | { ok: false; error: string };

async function settle<T>(p: Promise<T | null>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await p };
  } catch (e) {
    // Stored issues never carry the contact email or keys.
    return { ok: false, error: sanitize(e instanceof Error ? e.message : String(e)) };
  }
}

/** Keep a record only if its DOI equals the requested one; otherwise note why it was dropped. */
function matching<T extends { doi?: string | undefined }>(
  name: string,
  wanted: string,
  res: Settled<T>,
  issues: string[],
  blocking: string[],
): T | null {
  if (!res.ok) {
    issues.push(`${name} failed: ${res.error}`);
    blocking.push(name);
    return null;
  }
  if (!res.value) {
    issues.push(`${name} has no record for this DOI`);
    return null;
  }
  const got = res.value.doi ? normalizeDoi(res.value.doi) : null;
  if (got !== wanted) {
    issues.push(`${name} returned a different DOI (${sanitize(String(got ?? res.value.doi ?? "none")).slice(0, 120)}); record ignored`);
    blocking.push(name);
    return null;
  }
  return res.value;
}

/**
 * Verification receipt for one DOI.
 *  - `flagged`: a matching record says retracted/withdrawn, or the DOI is a retraction notice. Always wins.
 *  - `verified`: Crossref AND OpenAlex returned a record for exactly this DOI, OpenAlex reported an explicit
 *    `is_retracted`, and no service errored (Unpaywall included).
 *  - `unverified`: anything else. A failed or mismatched service never reads as clean; see `issues`.
 * A DOI Unpaywall does not know (404) is not an error: the license is "unknown" and an issue is recorded.
 */
export async function verifySource(ctx: EvidenceContext, rawDoi: string): Promise<SourceCheck> {
  const doi = requireDoi(rawDoi);
  ctx.requireEmail(); // fail loudly, not as three network errors
  const [crRes, oaRes, upRes] = await Promise.all([
    settle(getCrossrefWork(ctx, doi)),
    settle(getOpenAlexByDoi(ctx, doi)),
    settle(getUnpaywall(ctx, doi)),
  ]);

  const issues: string[] = [];
  const blocking: string[] = []; // services that errored or answered for a different DOI
  const crossref = matching("crossref", doi, crRes, issues, blocking);
  const openalex = matching("openalex", doi, oaRes, issues, blocking);
  const unpaywall = matching("unpaywall", doi, upRes, issues, blocking);
  if (openalex && typeof openalex.isRetracted !== "boolean") {
    issues.push("openalex did not report is_retracted");
  }
  if (crossref?.isRetractionNotice) issues.push("this DOI is a retraction notice, not the retracted work");

  const retractionSources: string[] = [];
  if (crossref?.isRetracted) retractionSources.push("crossref");
  if (openalex?.isRetracted === true) retractionSources.push("openalex");
  const retracted = retractionSources.length > 0;

  // Only Unpaywall's license counts as known; OpenAlex's is kept apart as a cross-check.
  const license = unpaywall?.license;
  const url = unpaywall?.url ?? openalex?.oa.url;
  const oa: OaInfo = {
    isOa: unpaywall?.isOa ?? openalex?.oa.isOa ?? false,
    ...(license ? { license } : {}),
    ...(url ? { url } : {}),
  };

  const noErrors = blocking.length === 0;
  const complete = crossref !== null && openalex !== null && typeof openalex.isRetracted === "boolean";
  const status = retracted || crossref?.isRetractionNotice ? "flagged" : complete && noErrors ? "verified" : "unverified";

  return {
    doi,
    checkedAt: ctx.now().toISOString(),
    status,
    exists: crossref !== null,
    title: crossref?.title || openalex?.title,
    retracted,
    retractionSources,
    oa,
    licenseStatus: license ? "known" : "unknown",
    ...(openalex?.oa.license ? { openalexLicense: openalex.oa.license } : {}),
    answered: { crossref: crossref !== null, openalex: openalex !== null, unpaywall: unpaywall !== null },
    issues,
  };
}

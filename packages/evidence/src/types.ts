export interface OaInfo {
  isOa: boolean;
  license?: string;
  url?: string;
}

/** Small normalized record shared by every search client. */
export interface WorkSummary {
  doi?: string;
  pmid?: string;
  title: string;
  year?: number;
  journal?: string;
  isReview?: boolean;
  isRetracted?: boolean;
  citedByCount?: number;
  oa: OaInfo;
  source: "pubmed" | "europepmc" | "openalex";
}

export type CheckStatus = "verified" | "flagged" | "unverified";

/** Verification receipt the claim pipeline stores next to a claim. */
export interface SourceCheck {
  doi: string;
  checkedAt: string;
  status: CheckStatus;
  exists: boolean;
  title?: string;
  retracted: boolean;
  retractionSources: string[];
  oa: OaInfo;
  /** Which services answered. A false entry means the call failed or found nothing. */
  answered: { crossref: boolean; openalex: boolean; unpaywall: boolean };
  issues: string[];
}

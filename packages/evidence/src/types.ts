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
  /** The record is a notice that retracts another work. */
  isRetractionNotice?: boolean;
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
  /** `unknown` when Unpaywall had no license, no record, or failed. */
  licenseStatus: "known" | "unknown";
  /** Which services answered. A false entry means the call failed or found nothing. */
  answered: { crossref: boolean; openalex: boolean; unpaywall: boolean };
  issues: string[];
}

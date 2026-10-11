// Paper ingestion for the claim pipeline: PubMed metadata, a full abstract from
// the matching PubMed record (via Europe PMC's MED copy, or Crossref's deposit),
// and the verifySource receipt. Fail closed: a paper is `ready` only when every
// identifier matches, the abstract is complete, the kind is admissible and the
// source is verified as not retracted. Abstracts are copyrighted: they go into
// private review packets only, never into the repository or a public table.
import type { EvidenceContext } from "./context";
import { getCrossrefWork } from "./crossref";
import { normalizeDoi, retractionFromPubTypes } from "./doi";
import { getEuropePmcByDoi, getEuropePmcByPmid, type EuropePmcWork } from "./europepmc";
import { sanitize } from "./http";
import { getPubMedByPmid } from "./pubmed";
import { retractionState, type RetractionState } from "./retraction";
import type { SourceCheck, WorkSummary } from "./types";
import { verifySource } from "./verify";

/** The `sources.kind` values a paper can have. Other publication types are not admissible as Spindle sources. */
export type PaperKind = "systematic_review" | "meta_analysis" | "position_stand";

export interface SourceInput {
  kind: PaperKind;
  title: string;
  doi: string;
  pmid?: string;
  license: string;
}

export interface IngestedPaper {
  doi: string | null;
  pmid: string | null;
  title: string | null;
  journal?: string;
  year?: number;
  kind: PaperKind | null;
  abstract: { text: string; origin: "europepmc-med" | "crossref" } | null;
  retraction: RetractionState;
  check: SourceCheck | null;
  status: "ready" | "blocked";
  issues: string[];
  /** Body for publisher_add_source when ready. */
  sourceInput: SourceInput | null;
  fetchedAt: string;
}

/** Shorter text is not an abstract a reviewer can judge a claim against. */
export const MIN_ABSTRACT_CHARS = 200;
const NO_LICENSE = "No reuse license recorded; cite and link only";

/**
 * From PubMed publication types only (a title is not evidence of design). Meta-analysis wins over
 * systematic review; guidelines and consensus statements are position stands.
 */
export function paperKind(pubTypes: readonly string[]): PaperKind | null {
  const types = pubTypes.map((t) => t.toLowerCase());
  if (types.some((t) => t.includes("meta-analysis"))) return "meta_analysis";
  if (types.some((t) => t.includes("systematic review"))) return "systematic_review";
  if (types.some((t) => /practice guideline|guideline|consensus/.test(t))) return "position_stand";
  return null;
}

async function attempt<T>(issues: string[], label: string, p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    issues.push(`${label} failed: ${sanitize(e instanceof Error ? e.message : String(e)).slice(0, 300)}`);
    return null;
  }
}

export async function ingestPaper(ctx: EvidenceContext, ref: { pmid?: string; doi?: string }): Promise<IngestedPaper> {
  const issues: string[] = [];
  const fetchedAt = ctx.now().toISOString();
  if (ref.pmid !== undefined && !/^\d{1,9}$/.test(ref.pmid)) throw new Error("PMIDs must be numeric strings");
  let doi = ref.doi !== undefined ? normalizeDoi(ref.doi) : null;
  if (ref.doi !== undefined && !doi) throw new Error(`Not a valid DOI: ${ref.doi}`);
  if (!ref.pmid && !doi) throw new Error("ingestPaper needs a pmid or a doi");

  let pubmed: WorkSummary | null = null;
  if (ref.pmid) {
    pubmed = await attempt(issues, "pubmed", getPubMedByPmid(ctx, ref.pmid));
    if (!pubmed) issues.push(`pubmed has no record for PMID ${ref.pmid}`);
    else if (pubmed.doi && doi && pubmed.doi !== doi) issues.push(`pubmed lists DOI ${pubmed.doi}, not ${doi}`);
    doi ??= pubmed?.doi ?? null;
  }
  if (!doi) issues.push("no DOI: verifySource needs one");

  // The PubMed record's full abstract, matched on PMID (and DOI); else the DOI record.
  let epmc: EuropePmcWork | null = null;
  if (ref.pmid) epmc = await attempt(issues, "europepmc", getEuropePmcByPmid(ctx, ref.pmid));
  else if (doi) epmc = await attempt(issues, "europepmc", getEuropePmcByDoi(ctx, doi, { maxAbstractChars: Number.POSITIVE_INFINITY }));
  if (epmc && doi && epmc.doi && epmc.doi !== doi) {
    issues.push(`europepmc record lists DOI ${epmc.doi}, not ${doi}; record ignored`);
    epmc = null;
  }
  const pmid = ref.pmid ?? epmc?.pmid ?? pubmed?.pmid ?? null;

  const check = doi ? await attempt(issues, "verifySource", verifySource(ctx, doi)) : null;
  if (check) issues.push(...check.issues.map((i) => `verifySource: ${i}`));

  let abstract: IngestedPaper["abstract"] = null;
  if (epmc?.abstract && !epmc.abstractTruncated) abstract = { text: epmc.abstract, origin: "europepmc-med" };
  if (!abstract && doi) {
    const cr = await attempt(issues, "crossref abstract", getCrossrefWork(ctx, doi));
    if (cr?.abstract && cr.doi === doi) abstract = { text: cr.abstract, origin: "crossref" };
  }
  if (!abstract) issues.push("no full abstract from a record with matching identifiers");
  else if (abstract.text.length < MIN_ABSTRACT_CHARS) {
    issues.push(`the abstract has ${abstract.text.length} characters; a review packet needs at least ${MIN_ABSTRACT_CHARS}`);
  }

  const pubTypes = epmc?.pubTypes ?? [];
  const title = check?.title ?? epmc?.title ?? pubmed?.title ?? null;
  const kind = paperKind(pubTypes);
  if (!kind) issues.push(`publication types (${pubTypes.join(", ") || "none"}) are not a systematic review, meta-analysis or position stand`);
  const flaggedElsewhere =
    pubmed?.isRetracted === true || pubmed?.isRetractionNotice === true || retractionFromPubTypes(pubTypes).isRetracted || retractionFromPubTypes(pubTypes).isRetractionNotice;
  const retraction: RetractionState = check ? retractionState(check, flaggedElsewhere) : flaggedElsewhere ? "retracted" : "unknown";
  if (retraction === "retracted") issues.push("retracted or a retraction notice");
  if (retraction === "unknown") issues.push("retraction status unknown; never treated as not retracted");

  const ready =
    doi !== null && title !== null && kind !== null && abstract !== null && abstract.text.length >= MIN_ABSTRACT_CHARS &&
    retraction === "not_retracted" && !issues.some((i) => /lists DOI|has no record for PMID/.test(i));
  return {
    doi,
    pmid,
    title,
    ...(epmc?.journal ?? pubmed?.journal ? { journal: epmc?.journal ?? pubmed?.journal } : {}),
    ...(epmc?.year ?? pubmed?.year ? { year: epmc?.year ?? pubmed?.year } : {}),
    kind,
    abstract,
    retraction,
    check,
    status: ready ? "ready" : "blocked",
    issues,
    sourceInput: ready
      ? { kind: kind!, title: title!.slice(0, 500), doi: doi!, ...(pmid ? { pmid } : {}), license: (check?.oa.license ?? NO_LICENSE).slice(0, 200) }
      : null,
    fetchedAt,
  };
}

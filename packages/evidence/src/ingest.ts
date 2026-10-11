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
export type PaperKind = "systematic_review" | "meta_analysis" | "position_stand" | "foundation_reference";

/** D-12 override document types: guidance documents become position stands; open references become foundation references. */
export const GUIDANCE_TYPES = ["position_stand", "clinical_guideline", "consensus_statement", "care_pathway"] as const;
export const REFERENCE_TYPES = ["anatomy_reference", "nomenclature_reference"] as const;
export type KindOverrideType = (typeof GUIDANCE_TYPES)[number] | (typeof REFERENCE_TYPES)[number];

/** The source kind an override document type admits. */
export const overrideKind = (t: KindOverrideType): "position_stand" | "foundation_reference" =>
  (REFERENCE_TYPES as readonly string[]).includes(t) ? "foundation_reference" : "position_stand";

/**
 * An open licence: what a foundation reference must carry. The whole value must name CC BY (any
 * version), CC0 or public domain; the only text allowed after it is the matching Creative Commons
 * URL in parentheses. Anything else (a restriction, a note) refuses it (Sol R1/R2 PR26-01).
 * Mirrored in SQL by private.license_is_open.
 */
export const OPEN_LICENSE =
  /^\s*(?:(cc[\s_-]?by(?:[\s_-]?\d(?:\.\d)?)?)(?:\s*\(\s*https?:\/\/creativecommons\.org\/licenses\/by\/\d\.\d\/?\s*\))?|(cc0(?:[\s_-]?1\.0)?)(?:\s*\(\s*https?:\/\/creativecommons\.org\/publicdomain\/zero\/1\.0\/?\s*\))?|public[\s_-]domain)\s*$/i;
export const isOpenLicense = (license: string | null | undefined): boolean => OPEN_LICENSE.test(license ?? "");

/**
 * D-12: a publisher's assertion that PubMed mislabels a guidance document, or that an open
 * anatomy or nomenclature reference may support foundation claims (plan v3 section 4).
 */
export interface KindOverrideRequest {
  documentType: KindOverrideType;
  justification: string;
}

export interface SourceInput {
  kind: PaperKind;
  title: string;
  doi: string;
  pmid?: string;
  license: string;
  kindOverride?: KindOverrideRequest & { publicationTypes: string[] };
}

export interface IngestedPaper {
  doi: string | null;
  pmid: string | null;
  title: string | null;
  journal?: string;
  year?: number;
  kind: PaperKind | null;
  /** D-13: the PMC copy and the licences both records give, for full-text excerpts. */
  pmcid?: string;
  licenses?: { unpaywall?: string; europepmc?: string; openalex?: string };
  /** Present when the kind comes from a D-12 override rather than PubMed's publication types. */
  kindOverride?: KindOverrideRequest & { publicationTypes: string[] };
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

/** Publication types that name a study or a notice: an override is refused for them (D-12). */
export const NOT_GUIDANCE =
  /(trial|stud(y|ies)|observational|cohort|case.control|case reports?|cross-sectional|letter|comment|editorial|news|interview|retract|erratum|correct|expression of concern|preprint|dataset)/i;

/** Null when the override may apply to these publication types, otherwise why not. */
export function overrideRefusal(
  pubTypes: readonly string[],
  detected: PaperKind | null,
  o: KindOverrideRequest,
  license?: string | null,
): string | null {
  if (detected) return `PubMed already types this as ${detected}; no override is needed`;
  if (pubTypes.length === 0) return "no publication types to override";
  const bad = pubTypes.find((t) => NOT_GUIDANCE.test(t));
  if (bad) return `publication type "${bad}" names a study or notice; only guidance documents and open references can be overridden`;
  if (![...GUIDANCE_TYPES, ...REFERENCE_TYPES].includes(o.documentType)) return "unknown document type";
  if (overrideKind(o.documentType) === "foundation_reference" && !isOpenLicense(license)) {
    return `a foundation reference must carry an open licence (CC BY, CC0 or public domain), not ${JSON.stringify(license ?? "none")}`;
  }
  if (o.justification.trim().length < 40) return "the justification must say why (at least 40 characters)";
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

export async function ingestPaper(
  ctx: EvidenceContext,
  ref: { pmid?: string; doi?: string },
  opts: { kindOverride?: KindOverrideRequest } = {},
): Promise<IngestedPaper> {
  const issues: string[] = [];
  const fetchedAt = ctx.now().toISOString();
  if (ref.pmid !== undefined && !/^\d{1,9}$/.test(ref.pmid)) throw new Error("PMIDs must be numeric strings");
  let doi = ref.doi !== undefined ? normalizeDoi(ref.doi) : null;
  if (ref.doi !== undefined && !doi) throw new Error(`Not a valid DOI: ${ref.doi}`);
  if (!ref.pmid && !doi) throw new Error("ingestPaper needs a pmid or a doi");

  let pubmed: WorkSummary | null = null;
  if (ref.pmid) {
    pubmed = await attempt(issues, "pubmed", getPubMedByPmid(ctx, ref.pmid));
    if (pubmed && pubmed.pmid !== ref.pmid) {
      issues.push(`PubMed returned PMID ${pubmed.pmid} for ${ref.pmid}; record ignored`);
      pubmed = null;
    }
    if (!pubmed) issues.push(`pubmed has no record for PMID ${ref.pmid}`);
    else if (pubmed.doi && doi && pubmed.doi !== doi) issues.push(`pubmed lists DOI ${pubmed.doi}, not ${doi}`);
    doi ??= pubmed?.doi ?? null;
  }

  // The PubMed record's full abstract, matched on PMID (and DOI); else the DOI record.
  let epmc: EuropePmcWork | null = null;
  if (ref.pmid) epmc = await attempt(issues, "europepmc", getEuropePmcByPmid(ctx, ref.pmid));
  else if (doi) epmc = await attempt(issues, "europepmc", getEuropePmcByDoi(ctx, doi, { maxAbstractChars: Number.POSITIVE_INFINITY }));
  if (epmc && doi && epmc.doi && epmc.doi !== doi) {
    issues.push(`europepmc record lists DOI ${epmc.doi}, not ${doi}; record ignored`);
    epmc = null;
  }
  // The matched MED record may list the DOI PubMed's summary lacks.
  doi ??= epmc?.doi ?? null;
  if (!doi) issues.push("no DOI: verifySource needs one");
  const pmid = ref.pmid ?? epmc?.pmid ?? pubmed?.pmid ?? null;
  // A PMID's abstract counts for the DOI that verifySource checks only when a record ties them.
  if (ref.pmid && doi && pubmed?.doi !== doi && epmc?.doi !== doi) issues.push(`no record ties PMID ${ref.pmid} to DOI ${doi}`);

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

  // The matched Europe PMC record's types, else the PubMed record's (the Crossref fallback has none).
  const pubTypes = epmc?.pubTypes?.length ? epmc.pubTypes : (pubmed?.pubTypes ?? []);
  const title = check?.title ?? epmc?.title ?? pubmed?.title ?? null;
  const detected = paperKind(pubTypes);
  let kind = detected;
  let kindOverride: IngestedPaper["kindOverride"];
  // An override is judged on every label either record gives (Sol R1 PR26-02).
  const allTypes = [...new Set([...(epmc?.pubTypes ?? []), ...(pubmed?.pubTypes ?? [])])];
  if (opts.kindOverride) {
    const refusal = overrideRefusal(allTypes, paperKind(allTypes) ?? detected, opts.kindOverride, check?.oa.license);
    if (refusal) issues.push(`kind override refused: ${refusal}`);
    else {
      kind = overrideKind(opts.kindOverride.documentType);
      kindOverride = { ...opts.kindOverride, justification: opts.kindOverride.justification.trim(), publicationTypes: allTypes };
    }
  }
  if (!kind) issues.push(`publication types (${pubTypes.join(", ") || "none"}) are not a systematic review, meta-analysis or position stand`);
  // Year and journal only from PubMed or Europe PMC's MED copy of it (Sol R1 PR26-07).
  const med = epmc?.medRecord ? epmc : null;
  const year = pubmed?.year ?? med?.year;
  const journal = pubmed?.journal ?? med?.journal;
  if (year === undefined || !journal) issues.push("no publication year or journal from a PubMed record; a reviewer could not check a dated claim");
  const flaggedElsewhere =
    pubmed?.isRetracted === true || pubmed?.isRetractionNotice === true || retractionFromPubTypes(pubTypes).isRetracted || retractionFromPubTypes(pubTypes).isRetractionNotice;
  const retraction: RetractionState = check ? retractionState(check, flaggedElsewhere) : flaggedElsewhere ? "retracted" : "unknown";
  if (retraction === "retracted") issues.push("retracted or a retraction notice");
  if (retraction === "unknown") issues.push("retraction status unknown; never treated as not retracted");

  const ready =
    doi !== null && title !== null && kind !== null && year !== undefined && !!journal && !issues.some((i) => i.startsWith("kind override refused")) && abstract !== null && abstract.text.length >= MIN_ABSTRACT_CHARS &&
    retraction === "not_retracted" && !issues.some((i) => /lists DOI|has no record for PMID|no record ties PMID|PubMed returned PMID/.test(i));
  return {
    doi,
    pmid,
    title,
    ...(journal ? { journal } : {}),
    ...(year !== undefined ? { year } : {}),
    ...(epmc?.pmcid ? { pmcid: epmc.pmcid } : {}),
    licenses: {
      ...(check?.oa.license ? { unpaywall: check.oa.license } : {}),
      ...(epmc?.oa?.license ? { europepmc: epmc.oa.license } : {}),
      ...(check?.openalexLicense ? { openalex: check.openalexLicense } : {}),
    },
    kind,
    ...(kindOverride ? { kindOverride } : {}),
    abstract,
    retraction,
    check,
    status: ready ? "ready" : "blocked",
    issues,
    sourceInput: ready
      ? {
          kind: kind!,
          title: title!.slice(0, 500),
          doi: doi!,
          ...(pmid ? { pmid } : {}),
          license: (check?.oa.license ?? NO_LICENSE).slice(0, 200),
          ...(kindOverride ? { kindOverride } : {}),
        }
      : null,
    fetchedAt,
  };
}

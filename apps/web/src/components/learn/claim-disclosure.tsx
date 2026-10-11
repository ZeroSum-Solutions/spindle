import { ChevronDown, ExternalLink, TriangleAlert } from "lucide-react";
import type { ClaimView, SourceView } from "@/lib/learning/load";
import { formatDate } from "@/lib/learning/format";

const KIND: Record<string, string> = {
  textbook: "Textbook",
  position_stand: "Position stand",
  nomenclature: "Nomenclature",
  systematic_review: "Systematic review",
  meta_analysis: "Meta-analysis",
};

/**
 * Sources for one science block. Shows only what the claim record provides:
 * statement, evidence level, population and sources. Review receipts and expiry
 * are not readable by learners, so they are not shown or implied.
 */
export function ClaimDisclosure({
  claimIds,
  claims,
  flagged,
}: {
  claimIds: string[];
  claims: ReadonlyMap<string, ClaimView>;
  flagged: ReadonlySet<string>;
}) {
  const count = claimIds.length;
  return (
    <details className="group mt-3 rounded-control border border-border bg-surface">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 text-label font-medium text-brand hover:text-brand-hover">
        <span>
          Show sources <span className="text-text-muted">({count === 1 ? "1 claim" : `${count} claims`})</span>
        </span>
        <ChevronDown aria-hidden strokeWidth={1.75} className="disclosure-chevron size-5" />
      </summary>
      <ul className="flex flex-col divide-y divide-border border-t border-border">
        {claimIds.map((id) => {
          const claim = claims.get(id);
          return (
            <li key={id} className="flex flex-col gap-2 p-3 text-base">
              {claim ? (
                <>
                  {flagged.has(id) ? (
                    <p className="flex items-center gap-1.5 text-label font-medium text-danger">
                      <TriangleAlert aria-hidden strokeWidth={1.75} className="size-4" />
                      A source for this claim was retracted after publishing
                    </p>
                  ) : null}
                  <p className="text-text">{claim.statement}</p>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-label">
                    <dt className="text-text-muted">Evidence</dt>
                    <dd>{claim.evidenceLevel}</dd>
                    <dt className="text-text-muted">Population</dt>
                    <dd>{claim.population}</dd>
                  </dl>
                  <ul className="flex flex-col gap-2">
                    {claim.sources.map((s) => (
                      <SourceItem key={s.id} source={s} />
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-label text-text-muted">This claim&apos;s record is not available. The block&apos;s support type still applies.</p>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function SourceItem({ source }: { source: SourceView }) {
  const links = [
    source.doi ? { href: `https://doi.org/${source.doi}`, label: `DOI ${source.doi}` } : null,
    source.pmid ? { href: `https://pubmed.ncbi.nlm.nih.gov/${source.pmid}/`, label: `PMID ${source.pmid}` } : null,
    source.url && !source.doi && !source.pmid ? { href: source.url, label: "Source page" } : null,
  ].filter((l): l is { href: string; label: string } => l !== null);
  return (
    <li className="rounded-small bg-surface-muted p-3">
      <p className="font-medium">{source.title}</p>
      <p className="text-label text-text-muted">
        {KIND[source.kind] ?? source.kind}
        {source.locator ? `, ${source.locator}` : ""}
      </p>
      {source.retractedAt ? (
        <p className="text-label font-medium text-danger">Retracted, recorded {formatDate(source.retractedAt)}</p>
      ) : null}
      <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        {links.map((l) => (
          <a
            key={l.href}
            href={l.href}
            rel="noopener noreferrer"
            target="_blank"
            className="inline-flex min-h-11 items-center gap-1 font-mono text-code text-brand underline underline-offset-4 hover:text-brand-hover"
          >
            {l.label}
            <ExternalLink aria-hidden strokeWidth={1.75} className="size-3.5" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        ))}
      </p>
    </li>
  );
}

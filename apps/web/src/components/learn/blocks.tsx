import Link from "next/link";
import { ExternalLink, TriangleAlert } from "lucide-react";
import type { ClaimIntegrityState, LessonBlock, LessonResource, MediaAsset, MediaAvailability } from "@spindle/schema";
import { evidenceView, type EvidenceView } from "../../lib/learning/evidence";
import type { ClaimView } from "../../lib/learning/load";
import { renderableMediaUrl, resolveContentUrl } from "../../lib/learning/media";
import { ClaimDisclosure } from "./claim-disclosure";
import { LegacyDiagram, ReviewedDiagram } from "./diagrams";
import { SupportLabel } from "./labels";
import { MediaImage, MediaUnavailable, MediaVideo } from "./media-image";
import { QuizSelfCheck } from "./quiz-self-check";
import { supportLabelPlan } from "../../lib/learning/presentation";
import { YouTubeSegment } from "./youtube-segment";

export interface BlockContext {
  /** The gym that owns the version, or null for global content. */
  orgId: string | null;
  claims: ReadonlyMap<string, ClaimView>;
  flagged: ReadonlySet<string>;
  /** Registry state of the version's clips (version_media); a clip missing here never plays. */
  media?: ReadonlyMap<string, MediaAvailability>;
  /** The course's module quiz page, where graded questions are answered. */
  quizHref?: string;
  /** Claim integrity for this lesson (version_integrity), or null when it could not be read. Required: science never presents without it. */
  integrity: ReadonlyMap<string, ClaimIntegrityState> | null;
  /** The version being rendered; registry clips recheck their state against it when played. */
  versionId?: string;
  /** Whether this version has a graded quiz (phase-3 rules). Without one, science quiz blocks stay ungraded self-checks. */
  gradedQuiz?: boolean;
}

type SupportedBlock = Extract<LessonBlock, { support: unknown }>;

/** Integrity applies to science blocks only; practice blocks carry no claims. */
function blockEvidenceView(block: SupportedBlock, ctx: BlockContext): EvidenceView | null {
  return block.support === "science" ? evidenceView(block.claimIds, ctx.flagged, ctx.integrity) : null;
}

/** A science block that has lost its Science presentation: withdrawn, or its evidence status could not be read. */
function isWithdrawn(evidence: EvidenceView | null): boolean {
  return evidence !== null && !evidence.presentsAsScience && !evidence.statusUnknown;
}

function isUnknown(evidence: EvidenceView | null): boolean {
  return evidence !== null && evidence.statusUnknown;
}

export function LessonBlocks({ blocks, ctx }: { blocks: LessonBlock[]; ctx: BlockContext }) {
  // A withdrawn science block no longer presents as science, so it never shares a Science label.
  const labelled = supportLabelPlan(blocks, (block) => {
    const evidence = blockEvidenceView(block, ctx);
    return isWithdrawn(evidence) ? "withdrawn" : isUnknown(evidence) ? "unknown" : block.support;
  });
  return (
    <div className="flex flex-col gap-8">
      {blocks.map((block, i) => (
        <Block key={i} block={block} index={i} ctx={ctx} showLabel={labelled[i]!} />
      ))}
    </div>
  );
}

function Block({ block, index, ctx, showLabel }: { block: LessonBlock; index: number; ctx: BlockContext; showLabel: boolean }) {
  switch (block.kind) {
    case "heading":
      return <h2 className="pt-2 text-xl font-medium tracking-tight text-text">{block.content}</h2>;
    case "image":
      return <Figure asset={block.content} orgId={ctx.orgId} />;
    case "diagram":
      // A reviewed diagram (Sol R16) carries support and claims like a paragraph; an older
      // {diagramId, caption} block from a historical snapshot renders as it was, without a legend.
      return "support" in block ? <Supported block={block} index={index} ctx={ctx} showLabel={showLabel} /> : <LegacyDiagram content={block.content} />;
    case "video":
      return <YouTubeSegment segment={block.content} availability={ctx.media?.get(block.content.mediaId)} versionId={ctx.versionId} />;
    default:
      return <Supported block={block} index={index} ctx={ctx} showLabel={showLabel} />;
  }
}

/**
 * A block that says something about the body. Its support shows as a label at the start
 * of each run of same-support blocks and, from 1024px, as a coloured rule in the margin
 * of every block, so back-to-back blocks are not labelled over and over.
 */
function Supported({ block, index, ctx, showLabel }: { block: SupportedBlock; index: number; ctx: BlockContext; showLabel: boolean }) {
  const science = block.support === "science";
  const evidence = blockEvidenceView(block, ctx);
  const withdrawn = isWithdrawn(evidence);
  const unknown = isUnknown(evidence);
  const retracted = evidence?.retracted ?? block.claimIds.some((id) => ctx.flagged.has(id));
  const recheckDue = !withdrawn && (evidence?.recheckDue ?? false);
  const rule = withdrawn || unknown ? "lg:border-control" : science ? "lg:border-science" : "lg:border-practice";
  return (
    <section
      data-block={block.kind}
      data-support={block.support}
      data-evidence={withdrawn ? "withdrawn" : unknown ? "unknown" : recheckDue ? "recheck-due" : undefined}
      className={`flex flex-col gap-3 lg:-ml-[18px] lg:border-l-2 lg:pl-4 ${rule}`}
    >
      {showLabel || withdrawn || unknown || retracted || recheckDue ? (
        <div className="flex flex-wrap items-center gap-2">
          {withdrawn ? (
            // A withdrawn claim loses the Science presentation; the text and its sources stay as history.
            <span className="inline-flex items-center gap-1.5 rounded-small bg-caution-soft px-2 py-0.5 text-label font-medium text-caution">
              <TriangleAlert aria-hidden strokeWidth={1.75} className="size-4" />
              Claim withdrawn
            </span>
          ) : unknown ? (
            // Fail closed: without the integrity report the statement is not presented as science.
            <span className="inline-flex items-center gap-1.5 rounded-small bg-surface-muted px-2 py-0.5 text-label font-medium text-text-muted">
              <TriangleAlert aria-hidden strokeWidth={1.75} className="size-4" />
              Evidence status unavailable
            </span>
          ) : showLabel ? (
            <SupportLabel support={block.support} />
          ) : null}
          {retracted ? (
            <span className="inline-flex items-center gap-1.5 rounded-small bg-caution-soft px-2 py-0.5 text-label font-medium text-caution">
              <TriangleAlert aria-hidden strokeWidth={1.75} className="size-4" />
              Source retracted
            </span>
          ) : null}
          {recheckDue ? (
            <span className="inline-flex items-center gap-1.5 rounded-small bg-caution-soft px-2 py-0.5 text-label font-medium text-caution">
              <TriangleAlert aria-hidden strokeWidth={1.75} className="size-4" />
              Evidence due for recheck
            </span>
          ) : null}
        </div>
      ) : null}
      {withdrawn ? (
        <p className="text-label text-text-muted">The research claim behind this statement was withdrawn after publishing, so it is no longer presented as science.</p>
      ) : null}
      <BlockBody block={block} index={index} quizHref={ctx.quizHref} graded={ctx.gradedQuiz === true} />
      {science && block.claimIds.length > 0 ? <ClaimDisclosure claimIds={block.claimIds} claims={ctx.claims} flagged={ctx.flagged} /> : null}
    </section>
  );
}

function BlockBody({ block, index, quizHref, graded }: { block: SupportedBlock; index: number; quizHref?: string; graded: boolean }) {
  switch (block.kind) {
    case "paragraph":
      return <p className="whitespace-pre-line">{block.content}</p>;
    case "callout":
      return (
        <aside className="rounded-card border-l-4 border-ink bg-surface-muted p-4">
          <p className="text-label font-medium text-text-muted">{block.content.label}</p>
          <p className="mt-1 whitespace-pre-line">{block.content.text}</p>
        </aside>
      );
    case "checklist":
      return (
        <ul className="flex list-disc flex-col gap-1 pl-6 marker:text-text-muted">
          {block.content.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
    case "diagram":
      return <ReviewedDiagram content={block.content} nested />;
    case "quiz":
      // A science quiz block is a graded question of the module quiz: the lesson shows the
      // question but never its answer. Practice quizzes stay ungraded self-checks.
      return block.support === "science" && graded ? (
        <div data-graded-question className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4">
          <p className="font-medium">{block.content.prompt}</p>
          <p className="text-label text-text-muted">
            Graded question. Answer it in the module quiz, where your answers are saved and scored.{" "}
            {quizHref ? (
              <Link href={quizHref} className="text-brand underline underline-offset-2 hover:text-brand-hover">
                Go to the module quiz
              </Link>
            ) : null}
          </p>
        </div>
      ) : (
        <QuizSelfCheck id={`q${index}`} {...block.content} />
      );
  }
}

function Figure({ asset, orgId }: { asset: MediaAsset; orgId: string | null }) {
  const link = renderableMediaUrl(asset.src, { orgId });
  return (
    <figure data-block="image" className="flex flex-col gap-2">
      {link.kind === "unavailable" ? (
        <MediaUnavailable alt={asset.alt} kind={asset.kind === "video" ? "video" : "image"} />
      ) : asset.kind === "video" ? (
        <MediaVideo src={link.url} alt={asset.alt} />
      ) : (
        <MediaImage src={link.url} alt={asset.alt} />
      )}
      {asset.caption ? <figcaption className="text-label text-text-muted">{asset.caption}</figcaption> : null}
    </figure>
  );
}

export function LessonMedia({ media, orgId }: { media: MediaAsset[]; orgId: string | null }) {
  if (media.length === 0) return null;
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">Media</h2>
      {media.map((asset, i) => (
        <Figure key={i} asset={asset} orgId={orgId} />
      ))}
    </section>
  );
}

const RESOURCE_TYPE: Record<LessonResource["type"], string> = { worksheet: "Worksheet", reference: "Reference", transcript: "Transcript" };

export function LessonResources({ resources, orgId }: { resources: LessonResource[]; orgId: string | null }) {
  if (resources.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-medium">Resources</h2>
      <ul className="flex flex-col divide-y divide-border border-y border-border">
        {resources.map((r, i) => {
          const link = resolveContentUrl(r.href, { orgId });
          return (
            <li key={i} className="flex min-h-12 flex-wrap items-center justify-between gap-2 py-2">
              <span className="text-label text-text-muted">{RESOURCE_TYPE[r.type]}</span>
              {link.kind === "unavailable" ? (
                <span className="text-text-muted">{r.label} (unavailable)</span>
              ) : (
                <a
                  href={link.url}
                  rel="noopener noreferrer"
                  target={link.kind === "external" ? "_blank" : undefined}
                  className="inline-flex min-h-11 items-center gap-1 text-brand underline underline-offset-4 hover:text-brand-hover"
                >
                  {r.label}
                  {link.kind === "external" ? (
                    <>
                      <ExternalLink aria-hidden strokeWidth={1.75} className="size-4" />
                      <span className="sr-only">(opens in a new tab)</span>
                    </>
                  ) : null}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

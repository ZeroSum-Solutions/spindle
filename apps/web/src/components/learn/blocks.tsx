import { ExternalLink, ImageOff, TriangleAlert } from "lucide-react";
import type { LessonBlock, LessonResource, MediaAsset } from "@spindle/schema";
import type { ClaimView } from "@/lib/learning/load";
import { resolveContentUrl } from "@/lib/learning/media";
import { ClaimDisclosure } from "./claim-disclosure";
import { DIAGRAMS, DiagramFigure } from "./diagrams";
import { SupportLabel } from "./labels";
import { MediaImage, MediaUnavailable, MediaVideo } from "./media-image";
import { QuizSelfCheck } from "./quiz-self-check";
import { supportLabelPlan } from "@/lib/learning/presentation";

export interface BlockContext {
  /** The gym that owns the version, or null for global content. */
  orgId: string | null;
  claims: ReadonlyMap<string, ClaimView>;
  flagged: ReadonlySet<string>;
}

export function LessonBlocks({ blocks, ctx }: { blocks: LessonBlock[]; ctx: BlockContext }) {
  const labelled = supportLabelPlan(blocks);
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
    case "diagram": {
      const entry = DIAGRAMS[block.content.diagramId];
      if (entry) {
        return (
          <figure data-block="diagram" data-diagram="available" className="flex flex-col gap-2">
            <DiagramFigure entry={entry} />
            {block.content.caption ? <figcaption className="text-label text-text-muted">{block.content.caption}</figcaption> : null}
          </figure>
        );
      }
      return (
        <figure data-block="diagram" className="flex flex-col gap-2">
          <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-card border border-dashed border-control bg-surface-muted p-6 text-center text-text-muted">
            <ImageOff aria-hidden strokeWidth={1.75} className="size-6" />
            <p className="text-label">This diagram is not available yet.</p>
          </div>
          {block.content.caption ? <figcaption className="text-label text-text-muted">{block.content.caption}</figcaption> : null}
        </figure>
      );
    }
    default:
      return <Supported block={block} index={index} ctx={ctx} showLabel={showLabel} />;
  }
}

type SupportedBlock = Extract<LessonBlock, { support: unknown }>;

/**
 * A block that says something about the body. Its support shows as a label at the start
 * of each run of same-support blocks and, from 1024px, as a coloured rule in the margin
 * of every block, so back-to-back blocks are not labelled over and over.
 */
function Supported({ block, index, ctx, showLabel }: { block: SupportedBlock; index: number; ctx: BlockContext; showLabel: boolean }) {
  const retracted = block.claimIds.some((id) => ctx.flagged.has(id));
  const rule = block.support === "science" ? "lg:border-science" : "lg:border-practice";
  return (
    <section data-block={block.kind} data-support={block.support} className={`flex flex-col gap-3 lg:-ml-[18px] lg:border-l-2 lg:pl-4 ${rule}`}>
      {showLabel || retracted ? (
      <div className="flex flex-wrap items-center gap-2">
        {showLabel ? <SupportLabel support={block.support} /> : null}
        {retracted ? (
          <span className="inline-flex items-center gap-1.5 rounded-small bg-caution-soft px-2 py-0.5 text-label font-medium text-caution">
            <TriangleAlert aria-hidden strokeWidth={1.75} className="size-4" />
            Source retracted
          </span>
        ) : null}
      </div>
      ) : null}
      <BlockBody block={block} index={index} />
      {block.support === "science" && block.claimIds.length > 0 ? (
        <ClaimDisclosure claimIds={block.claimIds} claims={ctx.claims} flagged={ctx.flagged} />
      ) : null}
    </section>
  );
}

function BlockBody({ block, index }: { block: SupportedBlock; index: number }) {
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
    case "quiz":
      return <QuizSelfCheck id={`q${index}`} {...block.content} />;
  }
}

function Figure({ asset, orgId }: { asset: MediaAsset; orgId: string | null }) {
  const link = resolveContentUrl(asset.src, { orgId });
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

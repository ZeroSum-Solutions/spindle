import { ExternalLink, ImageOff, TriangleAlert } from "lucide-react";
import type { LessonBlock, LessonResource, MediaAsset } from "@spindle/schema";
import type { ClaimView } from "@/lib/learning/load";
import { resolveContentUrl } from "@/lib/learning/media";
import { ClaimDisclosure } from "./claim-disclosure";
import { SupportLabel } from "./labels";
import { MediaImage, MediaUnavailable } from "./media-image";
import { QuizSelfCheck } from "./quiz-self-check";

export interface BlockContext {
  /** The gym that owns the version, or null for global content. */
  orgId: string | null;
  claims: ReadonlyMap<string, ClaimView>;
  flagged: ReadonlySet<string>;
}

export function LessonBlocks({ blocks, ctx }: { blocks: LessonBlock[]; ctx: BlockContext }) {
  return (
    <div className="flex flex-col gap-8">
      {blocks.map((block, i) => (
        <Block key={i} block={block} index={i} ctx={ctx} />
      ))}
    </div>
  );
}

function Block({ block, index, ctx }: { block: LessonBlock; index: number; ctx: BlockContext }) {
  switch (block.kind) {
    case "heading":
      return <h2 className="pt-2 text-xl font-medium tracking-tight text-text">{block.content}</h2>;
    case "image":
      return <Figure asset={block.content} orgId={ctx.orgId} />;
    case "diagram":
      return (
        <figure data-block="diagram" className="flex flex-col gap-2">
          <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-card border border-dashed border-control bg-surface-muted p-6 text-center text-text-muted">
            <ImageOff aria-hidden strokeWidth={1.75} className="size-6" />
            <p className="text-label">This diagram is not available yet.</p>
          </div>
          {block.content.caption ? <figcaption className="text-label text-text-muted">{block.content.caption}</figcaption> : null}
        </figure>
      );
    default:
      return <Supported block={block} index={index} ctx={ctx} />;
  }
}

type SupportedBlock = Extract<LessonBlock, { support: unknown }>;

function Supported({ block, index, ctx }: { block: SupportedBlock; index: number; ctx: BlockContext }) {
  const retracted = block.claimIds.some((id) => ctx.flagged.has(id));
  return (
    <section data-block={block.kind} data-support={block.support} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SupportLabel support={block.support} />
        {retracted ? (
          <span className="inline-flex items-center gap-1.5 rounded-small bg-danger-soft px-2 py-0.5 text-label font-medium text-danger">
            <TriangleAlert aria-hidden strokeWidth={1.75} className="size-4" />
            Source retracted
          </span>
        ) : null}
      </div>
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
        <MediaUnavailable alt={asset.alt} />
      ) : asset.kind === "video" ? (
        <video controls preload="none" className="w-full rounded-card bg-surface-muted" aria-label={asset.alt}>
          <source src={link.url} />
        </video>
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
      <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-surface">
        {resources.map((r, i) => {
          const link = resolveContentUrl(r.href, { orgId });
          return (
            <li key={i} className="flex min-h-12 flex-wrap items-center justify-between gap-2 px-4 py-2">
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

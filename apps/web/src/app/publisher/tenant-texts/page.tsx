import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AppHeader, ErrorNote } from "@/components/ui";
import { parseDecision } from "@/lib/publisher/admission";
import { heldTexts, publisherClient, type HeldTextRow } from "@/lib/publisher/load";

// The publisher admission screen (P4-A2: "a LEAD tool, not tenant UI"). Content publishers review
// each pending held text in full, with its slot, gym and hash, and admit or reject it through
// publisher_decide_tenant_text with that hash. Decided, revoked and replaced texts are history,
// read-only. Everyone else gets a hard 404 (the proxy, and again here at request time).

const PATH = "/publisher/tenant-texts";

export const metadata: Metadata = { title: "Held texts awaiting admission", robots: { index: false } };

const ERRORS: Record<string, string> = {
  input: "This decision could not be read. Reload the page and try again.",
  reason: "Give a reason to reject.",
  decision: "The decision was refused: the text may have changed, been replaced or already been decided. Reload and review it again.",
};

export default function PublisherTenantTexts(props: PageProps<"/publisher/tenant-texts">) {
  return (
    <>
      <AppHeader frame="max-w-4xl" context="Publisher" />
      <main className="flex w-full flex-1 flex-col px-4 py-10 md:px-8">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
          <Suspense fallback={<p className="text-text-muted">Loading held texts…</p>}>
            <Admission {...props} />
          </Suspense>
        </div>
      </main>
    </>
  );
}

async function decide(form: FormData) {
  "use server";
  const parsed = parseDecision(form);
  if (!parsed.ok) redirect(`${PATH}?error=${parsed.error === ERRORS.reason ? "reason" : "input"}`);
  const supabase = await publisherClient();
  const { textId, textHash, decision, reason } = parsed.value;
  const { error } = await supabase.rpc("admission_decide_tenant_text", { p_text: textId, p_decision: { decision, reason, textHash } });
  if (error) redirect(`${PATH}?error=decision`);
  revalidatePath(PATH);
  redirect(`${PATH}?done=${decision}`);
}

async function Admission({ searchParams }: PageProps<"/publisher/tenant-texts">) {
  await connection();
  const supabase = await publisherClient();
  const [rows, sp] = await Promise.all([heldTexts(supabase), searchParams]);
  const error = typeof sp.error === "string" ? ERRORS[sp.error] : undefined;
  const pending = rows.filter((r) => r.status === "pending" && !r.superseded);
  const history = rows.filter((r) => !(r.status === "pending" && !r.superseded));
  const byGym = Map.groupBy(pending, (r) => r.org_id);

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-heading font-medium text-text">Held texts awaiting admission</h1>
        <p className="max-w-[68ch] text-text-muted">
          Gyms&apos; member-visible texts stay hidden until you admit them. Read each text in full; your decision is recorded against the exact hash shown.
        </p>
      </div>
      <ErrorNote message={error} />
      {sp.done === "admitted" || sp.done === "rejected" ? (
        <p role="status" className="rounded-small bg-surface-muted px-3 py-2 text-label text-text">
          Recorded: {sp.done === "admitted" ? "admitted" : "rejected"}.
        </p>
      ) : null}

      <section aria-labelledby="pending-title" data-pending className="flex flex-col gap-6">
        <h2 id="pending-title" className="text-xl font-medium">
          Pending ({pending.length})
        </h2>
        {pending.length === 0 ? <p className="text-text-muted">Nothing is waiting for a decision.</p> : null}
        {[...byGym.values()].map((items) => (
          <section key={items[0]!.org_id} aria-label={items[0]!.org_name} className="flex flex-col gap-3">
            <h3 className="text-label font-medium uppercase tracking-[0.08em] text-text-muted">
              {items[0]!.org_name} <span className="font-mono normal-case tracking-normal">({items[0]!.org_slug})</span>
            </h3>
            <ul className="flex flex-col gap-4">
              {items.map((r) => (
                <li key={r.text_id}>
                  <PendingText row={r} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </section>

      <section aria-labelledby="history-title" data-admission-history className="flex flex-col gap-3 border-t border-border pt-6">
        <h2 id="history-title" className="text-xl font-medium">
          History
        </h2>
        {history.length === 0 ? <p className="text-text-muted">No decisions yet.</p> : null}
        <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-surface">
          {history.map((r) => (
            <li key={r.text_id} data-history-id={r.text_id} className="flex flex-col gap-1.5 px-4 py-3">
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-label text-text-muted">
                <span className="font-medium text-text">{STATUS[r.superseded && r.status === "pending" ? "superseded" : r.status]}</span>
                <span>{r.org_name}</span>
                <span className="font-mono">{r.slot}</span>
                {r.decided_at ? <span>{formatWhen(r.decided_at)}</span> : null}
              </p>
              <p className="whitespace-pre-wrap break-words">{r.text}</p>
              {r.reason ? <p className="text-label text-text-muted">Reason: {r.reason}</p> : null}
              {r.revocation_reason ? <p className="text-label text-text-muted">Revoked: {r.revocation_reason}</p> : null}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

const STATUS: Record<string, string> = {
  admitted: "Admitted",
  rejected: "Rejected",
  revoked: "Revoked",
  cleared: "Cleared",
  superseded: "Replaced by a newer save",
  pending: "Pending",
};

const formatWhen = (iso: string) => new Date(iso).toISOString().replace("T", " ").slice(0, 16) + " UTC";

function PendingText({ row }: { row: HeldTextRow }) {
  const reasonId = `reason-${row.text_id}`;
  return (
    <article data-text-id={row.text_id} className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 md:p-5">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-label text-text-muted">
        <span className="rounded-small bg-surface-muted px-2 py-0.5 font-mono text-text">{row.slot}</span>
        {row.course_title ? <span>Course: {row.course_title}</span> : null}
        <span>Saved {formatWhen(row.saved_at)}</span>
        <span>Rules {row.rules_version}</span>
      </p>
      <blockquote className="whitespace-pre-wrap break-words border-l-2 border-control pl-3 text-reading text-text">{row.text}</blockquote>
      <p className="text-label text-text-muted">
        Hash{" "}
        <code data-text-hash className="break-all font-mono text-code text-text">
          {row.text_hash}
        </code>
      </p>
      <form action={decide} className="flex flex-col gap-3 md:flex-row md:items-end">
        <input type="hidden" name="textId" value={row.text_id} />
        <input type="hidden" name="textHash" value={row.text_hash} />
        <label htmlFor={reasonId} className="flex flex-1 flex-col gap-1 text-label text-text">
          Reason
          <input
            id={reasonId}
            name="reason"
            maxLength={500}
            placeholder="Required to reject"
            className="min-h-11 rounded-control border border-control bg-surface px-3 text-base text-text"
          />
        </label>
        <div className="flex gap-3">
          <button type="submit" name="decision" value="admitted" className="min-h-11 rounded-control bg-ink px-5 font-medium text-white hover:bg-ink-hover">
            Admit
          </button>
          <button
            type="submit"
            name="decision"
            value="rejected"
            className="min-h-11 rounded-control border border-control bg-surface px-5 font-medium text-text hover:bg-surface-muted"
          >
            Reject
          </button>
        </div>
      </form>
    </article>
  );
}

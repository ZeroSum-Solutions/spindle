import "server-only";
import { notFound } from "next/navigation";
import { z } from "zod";
import { createClient, currentUser } from "@/lib/supabase/server";

// The admission screen's reads, as the signed-in content publisher (no service key). The RPCs
// refuse everyone else; a non-publisher is a 404 here too, never a hint that the page exists.

type Client = Awaited<ReturnType<typeof createClient>>;

/** The signed-in content publisher's client, or a 404. */
export async function publisherClient(): Promise<Client> {
  const me = await currentUser();
  if (!me) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_content_publisher");
  if (error || data !== true) notFound();
  return supabase;
}

const rowSchema = z.object({
  text_id: z.uuid(),
  org_id: z.uuid(),
  org_name: z.string(),
  org_slug: z.string(),
  slot: z.string(),
  course_id: z.uuid().nullable(),
  course_title: z.string().nullable(),
  text: z.string(),
  text_hash: z.string().regex(/^[0-9a-f]{64}$/),
  rules_version: z.string(),
  saved_at: z.string(),
  status: z.enum(["pending", "admitted", "rejected", "revoked", "cleared"]),
  superseded: z.boolean(),
  decided_by: z.uuid().nullable(),
  decided_at: z.string().nullable(),
  reason: z.string().nullable(),
  revoked_at: z.string().nullable(),
  revocation_reason: z.string().nullable(),
  seq: z.number().int(),
});
export type HeldTextRow = z.infer<typeof rowSchema>;

const PAGE = 500;

/**
 * The whole pending queue, page by page after a seq cursor (each page stays under PostgREST's
 * max_rows), then the newest 500 history rows. The queue is never truncated (Sol R2 on #46).
 */
export async function heldTexts(supabase: Client): Promise<HeldTextRow[]> {
  const pending: HeldTextRow[] = [];
  for (let after = 0; ; ) {
    const { data, error } = await supabase.rpc("admission_pending_tenant_texts", { p_after: after, p_limit: PAGE });
    if (error) throw new Error("Could not load the held texts.");
    const page = z.array(rowSchema).max(PAGE).parse(data);
    pending.push(...page);
    if (page.length < PAGE) break;
    after = page.at(-1)!.seq;
  }
  const { data, error } = await supabase.rpc("admission_tenant_texts");
  if (error) throw new Error("Could not load the held texts.");
  const history = z.array(rowSchema).max(PAGE).parse(data);
  return [...pending.reverse(), ...history];
}

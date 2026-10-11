import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ErrorNote, Page } from "@/components/ui";
import { slugSchema } from "@/lib/forms";
import { createClient, currentUser } from "@/lib/supabase/server";
import { changeRole, removeMember, revokeInvite } from "../actions";
import { InviteForm } from "./invite-form";

export default function GymPage(props: PageProps<"/gyms/[slug]">) {
  return (
    <Suspense fallback={<Page title="Gym">Loading…</Page>}>
      <Gym {...props} />
    </Suspense>
  );
}

async function Gym({ params, searchParams }: PageProps<"/gyms/[slug]">) {
  const [{ slug: rawSlug }, query, me] = await Promise.all([params, searchParams, currentUser()]);
  const slug = slugSchema.safeParse(rawSlug);
  if (!slug.success || !me) notFound();

  const supabase = await createClient();
  const { data: org, error: orgError } = await supabase
    .from("orgs")
    .select("id, name, slug")
    .eq("slug", slug.data)
    .maybeSingle();
  if (orgError) throw new Error("Could not load this gym. Try again.");
  if (!org) notFound();

  const { data: members, error: membersError } = await supabase
    .from("memberships")
    .select("user_id, role, created_at")
    .eq("org_id", org.id)
    .order("created_at");
  if (membersError) throw new Error("Could not load the members. Try again.");
  const myRole = members.find((m) => m.user_id === me.id)?.role;
  const canInvite = myRole === "owner" || myRole === "lead";

  const { data: invites, error: invitesError } = canInvite
    ? await supabase
        .from("invites")
        .select("id, email, role, invited_by")
        .eq("org_id", org.id)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .order("created_at")
    : { data: [], error: null };
  if (invitesError) throw new Error("Could not load pending invites. Try again.");

  return (
    <Page title={org.name}>
      <ErrorNote message={typeof query.error === "string" ? query.error : undefined} />

      <Link
        href={`/gyms/${org.slug}/learn`}
        className="inline-flex min-h-12 items-center gap-2 self-start rounded-control bg-ink px-5 font-medium text-on-ink hover:bg-ink-hover"
      >
        Your courses
      </Link>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Members</h2>
        <ul className="flex flex-col divide-y divide-foreground/10 rounded-md border border-foreground/15">
          {members.map((m) => (
            <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <span className="font-mono text-xs">{m.user_id === me.id ? "You" : m.user_id.slice(0, 8)}</span>
              <span className="text-sm">{m.role}</span>
              {myRole === "owner" ? <MemberControls orgId={org.id} userId={m.user_id} /> : null}
            </li>
          ))}
        </ul>
      </section>

      {canInvite ? <InviteForm orgId={org.id} canInviteLeads={myRole === "owner"} /> : null}

      {invites && invites.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Pending invites</h2>
          <ul className="flex flex-col divide-y divide-foreground/10 rounded-md border border-foreground/15">
            {invites.map((invite) => (
              <li key={invite.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span>{invite.email}</span>
                <span>{invite.role}</span>
                {myRole === "owner" || invite.invited_by === me.id ? (
                  <form action={revokeInvite}>
                    <input type="hidden" name="orgId" value={org.id} />
                    <input type="hidden" name="inviteId" value={invite.id} />
                    <button className="min-h-11 underline underline-offset-4">Revoke</button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Page>
  );
}

function MemberControls({ orgId, userId }: { orgId: string; userId: string }) {
  return (
    <div className="flex gap-2">
      <form action={changeRole} className="flex gap-2">
        <input type="hidden" name="orgId" value={orgId} />
        <input type="hidden" name="userId" value={userId} />
        <select name="role" aria-label="New role" className="min-h-11 rounded-md border border-foreground/20 bg-background px-2 text-sm">
          <option value="trainer">Trainer</option>
          <option value="lead">Lead</option>
          <option value="owner">Owner</option>
        </select>
        <button className="min-h-11 text-sm underline underline-offset-4">Set role</button>
      </form>
      <form action={removeMember}>
        <input type="hidden" name="orgId" value={orgId} />
        <input type="hidden" name="userId" value={userId} />
        <button className="min-h-11 text-sm underline underline-offset-4">Remove</button>
      </form>
    </div>
  );
}

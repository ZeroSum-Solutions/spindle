import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Button, ErrorNote, Field, Page } from "@/components/ui";
import { createClient, currentUser } from "@/lib/supabase/server";
import { changeRole, inviteMember, removeMember } from "../actions";

export default function GymPage(props: PageProps<"/gyms/[slug]">) {
  return (
    <Suspense fallback={<Page title="Gym">Loading…</Page>}>
      <Gym {...props} />
    </Suspense>
  );
}

async function Gym({ params, searchParams }: PageProps<"/gyms/[slug]">) {
  const [{ slug }, query, me] = await Promise.all([params, searchParams, currentUser()]);
  const supabase = await createClient();
  const { data: org } = await supabase.from("orgs").select("id, name, slug").eq("slug", slug).maybeSingle();
  if (!org || !me) notFound();

  const { data: members } = await supabase
    .from("memberships")
    .select("user_id, role, created_at")
    .eq("org_id", org.id)
    .order("created_at");
  const myRole = members?.find((m) => m.user_id === me.id)?.role;
  const canInvite = myRole === "owner" || myRole === "lead";
  const invite = typeof query.invite === "string" ? query.invite : undefined;

  return (
    <Page title={org.name}>
      <ErrorNote message={typeof query.error === "string" ? query.error : undefined} />
      {invite ? (
        <div className="rounded-md border border-foreground/20 p-4 text-sm">
          <p className="font-medium">Invite link for {String(query.for ?? "")}. It is shown once:</p>
          <code data-testid="invite-link" className="mt-2 block break-all">/invite/{invite}</code>
        </div>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Members</h2>
        <ul className="flex flex-col divide-y divide-foreground/10 rounded-md border border-foreground/15">
          {(members ?? []).map((m) => (
            <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <span className="font-mono text-xs">{m.user_id === me.id ? "You" : m.user_id.slice(0, 8)}</span>
              <span className="text-sm">{m.role}</span>
              {myRole === "owner" ? <MemberControls orgId={org.id} slug={org.slug} userId={m.user_id} /> : null}
            </li>
          ))}
        </ul>
      </section>

      {canInvite ? (
        <form action={inviteMember} className="flex flex-col gap-4 rounded-md border border-foreground/15 p-4">
          <h2 className="text-lg font-semibold">Invite staff</h2>
          <input type="hidden" name="orgId" value={org.id} />
          <input type="hidden" name="slug" value={org.slug} />
          <Field label="Staff email" name="email" type="email" required />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Role</span>
            <select name="role" className="min-h-11 rounded-md border border-foreground/20 bg-background px-3">
              <option value="trainer">Trainer</option>
              {myRole === "owner" ? <option value="lead">Lead (senior trainer)</option> : null}
            </select>
          </label>
          <Button type="submit">Create invite link</Button>
        </form>
      ) : null}
    </Page>
  );
}

function MemberControls({ orgId, slug, userId }: { orgId: string; slug: string; userId: string }) {
  return (
    <div className="flex gap-2">
      <form action={changeRole} className="flex gap-2">
        <input type="hidden" name="orgId" value={orgId} />
        <input type="hidden" name="slug" value={slug} />
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
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="userId" value={userId} />
        <button className="min-h-11 text-sm underline underline-offset-4">Remove</button>
      </form>
    </div>
  );
}

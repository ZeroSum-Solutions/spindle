"use client";

import { useActionState } from "react";
import { Button, ErrorNote, Field } from "@/components/ui";
import { inviteMember, type InviteState } from "../actions";

export function InviteForm({ orgId, canInviteLeads }: { orgId: string; canInviteLeads: boolean }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteMember, {});
  return (
    <form action={action} className="flex flex-col gap-4 rounded-md border border-foreground/15 p-4">
      <h2 className="text-lg font-semibold">Invite staff</h2>
      <ErrorNote message={state.error} />
      {state.link ? (
        <div className="rounded-md border border-foreground/20 p-3 text-sm">
          <p className="font-medium">Send this link to {state.email}. It is shown only now:</p>
          <code data-testid="invite-link" className="mt-2 block break-all">
            {state.link}
          </code>
        </div>
      ) : null}
      <input type="hidden" name="orgId" value={orgId} />
      <Field label="Staff email" name="email" type="email" required />
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Role</span>
        <select name="role" className="min-h-11 rounded-md border border-foreground/20 bg-background px-3">
          <option value="trainer">Trainer</option>
          {canInviteLeads ? <option value="lead">Lead (senior trainer)</option> : null}
        </select>
      </label>
      <Button type="submit" disabled={pending}>
        Create invite link
      </Button>
    </form>
  );
}

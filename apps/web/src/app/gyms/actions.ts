"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fail, parseForm, slugSchema } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const roleSchema = z.enum(["owner", "lead", "trainer"]);

/** The gym's canonical page, looked up through RLS (never trusted from the form). */
async function gymPath(orgId: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.from("orgs").select("slug").eq("id", orgId).maybeSingle();
  return data ? `/gyms/${data.slug}` : "/gyms";
}

const createGymSchema = z.object({
  name: z.string().trim().min(1, "Name your gym.").max(120),
  slug: slugSchema,
});

export async function createGym(form: FormData) {
  const { name, slug } = parseForm(createGymSchema, form, "/gyms");
  const supabase = await createClient();
  const { data: orgId, error } = await supabase.rpc("create_org", { org_name: name, org_slug: slug });
  if (error || !orgId) fail("/gyms", error?.code === "23505" ? "That web address is taken." : "Could not create the gym.");
  redirect(await gymPath(orgId));
}

export type InviteState = { link?: string; email?: string; error?: string };

const inviteSchema = z.object({
  orgId: z.uuid(),
  email: z.email("Enter a valid email address.").transform((v) => v.toLowerCase()),
  role: roleSchema.exclude(["owner"]),
});

/** Returns the invite link in action state, so it never enters a URL, history or logs. */
export async function inviteMember(_prev: InviteState, form: FormData): Promise<InviteState> {
  const parsed = inviteSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const { orgId, email, role } = parsed.data;
  const supabase = await createClient();
  const { data: token, error } = await supabase.rpc("create_invite", {
    target_org: orgId,
    invitee_email: email,
    invitee_role: role,
  });
  if (error || !token) return { error: error?.message ?? "Could not create the invite." };
  revalidatePath(await gymPath(orgId));
  return { link: `/invite/${token}`, email };
}

const memberSchema = z.object({ orgId: z.uuid(), userId: z.uuid() });

export async function changeRole(form: FormData) {
  const { orgId, userId, role } = parseForm(memberSchema.extend({ role: roleSchema }), form, "/gyms");
  const back = await gymPath(orgId);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_role", { target_org: orgId, member: userId, new_role: role });
  if (error) fail(back, error.message);
  revalidatePath(back);
}

export async function removeMember(form: FormData) {
  const { orgId, userId } = parseForm(memberSchema, form, "/gyms");
  const back = await gymPath(orgId);
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_member", { target_org: orgId, member: userId });
  if (error) fail(back, error.message);
  revalidatePath(back);
}

export async function revokeInvite(form: FormData) {
  const { orgId, inviteId } = parseForm(z.object({ orgId: z.uuid(), inviteId: z.uuid() }), form, "/gyms");
  const back = await gymPath(orgId);
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_invite", { invite_id: inviteId });
  if (error) fail(back, error.message);
  revalidatePath(back);
}

export async function acceptInvite(form: FormData) {
  const token = z.string().regex(/^[0-9a-f]{48}$/).safeParse(form.get("token"));
  if (!token.success) fail("/gyms", "That invite link is not valid.");
  const supabase = await createClient();
  const { data: orgId, error } = await supabase.rpc("accept_invite", { invite_token: token.data });
  if (error || !orgId) fail(`/invite/${token.data}`, error?.message ?? "Could not accept the invite.");
  redirect(await gymPath(orgId));
}

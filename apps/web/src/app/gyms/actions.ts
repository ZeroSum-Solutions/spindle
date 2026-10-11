"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fail, parseForm } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const roleSchema = z.enum(["owner", "lead", "trainer"]);

const createGymSchema = z.object({
  name: z.string().trim().min(1, "Name your gym.").max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/, "Use 3–48 lowercase letters, numbers or hyphens."),
});

export async function createGym(form: FormData) {
  const { name, slug } = parseForm(createGymSchema, form, "/gyms");
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_org", { org_name: name, org_slug: slug });
  if (error) fail("/gyms", error.code === "23505" ? "That web address is taken." : "Could not create the gym.");
  redirect(`/gyms/${slug}`);
}

const inviteSchema = z.object({
  orgId: z.uuid(),
  slug: z.string(),
  email: z.email("Enter a valid email address.").transform((v) => v.toLowerCase()),
  role: roleSchema.exclude(["owner"]),
});

export async function inviteMember(form: FormData) {
  const back = `/gyms/${String(form.get("slug") ?? "")}`;
  const { orgId, slug, email, role } = parseForm(inviteSchema, form, back);
  const supabase = await createClient();
  const { data: token, error } = await supabase.rpc("create_invite", {
    target_org: orgId,
    invitee_email: email,
    invitee_role: role,
  });
  if (error || !token) fail(back, error?.message ?? "Could not create the invite.");
  // The raw token is shown once to the inviter, who sends the link to the invitee.
  redirect(`/gyms/${slug}?invite=${encodeURIComponent(token)}&for=${encodeURIComponent(email)}`);
}

const memberSchema = z.object({ orgId: z.uuid(), slug: z.string(), userId: z.uuid() });

export async function changeRole(form: FormData) {
  const back = `/gyms/${String(form.get("slug") ?? "")}`;
  const { orgId, slug, userId } = parseForm(memberSchema, form, back);
  const role = roleSchema.safeParse(form.get("role"));
  if (!role.success) fail(back, "Pick a role.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_role", { target_org: orgId, member: userId, new_role: role.data });
  if (error) fail(back, error.message);
  revalidatePath(`/gyms/${slug}`);
}

export async function removeMember(form: FormData) {
  const back = `/gyms/${String(form.get("slug") ?? "")}`;
  const { orgId, slug, userId } = parseForm(memberSchema, form, back);
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_member", { target_org: orgId, member: userId });
  if (error) fail(back, error.message);
  revalidatePath(`/gyms/${slug}`);
}

export async function acceptInvite(form: FormData) {
  const token = z.string().regex(/^[0-9a-f]{48}$/).safeParse(form.get("token"));
  if (!token.success) fail("/gyms", "That invite link is not valid.");
  const supabase = await createClient();
  const { data: orgId, error } = await supabase.rpc("accept_invite", { invite_token: token.data });
  if (error || !orgId) fail(`/invite/${token.data}`, error?.message ?? "Could not accept the invite.");
  const { data: org } = await supabase.from("orgs").select("slug").eq("id", orgId).single();
  redirect(org ? `/gyms/${org.slug}` : "/gyms");
}

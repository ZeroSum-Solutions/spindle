"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { fail, parseForm, safeNext } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const emailSchema = z.object({
  email: z.email("Enter a valid email address.").transform((v) => v.toLowerCase()),
  next: z.string().optional(),
});

export async function sendCode(form: FormData) {
  const { email, next } = parseForm(emailSchema, form, "/sign-in");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) fail("/sign-in", "We could not send a code. Try again in a minute.");
  redirect(`/sign-in/verify?email=${encodeURIComponent(email)}&next=${encodeURIComponent(safeNext(next))}`);
}

const codeSchema = z.object({
  email: z.email(),
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from the email."),
  next: z.string().optional(),
});

export async function verifyCode(form: FormData) {
  const back = `/sign-in/verify?email=${encodeURIComponent(String(form.get("email") ?? ""))}`;
  const { email, code, next } = parseForm(codeSchema, form, back);
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error) fail(back, "That code is wrong or expired.");
  redirect(safeNext(next));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

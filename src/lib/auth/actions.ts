"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const emailSchema = z.string().trim().email();
const passwordSchema = z.string().min(8).max(128);

async function requestOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  if (!host) throw new Error("Request host is unavailable.");
  return `${proto}://${host}`;
}

function encoded(message: string) {
  return encodeURIComponent(message);
}

export async function signUpWithPassword(formData: FormData) {
  const email = emailSchema.safeParse(formData.get("email"));
  const password = passwordSchema.safeParse(formData.get("password"));

  if (!email.success || !password.success) {
    redirect(`/register?error=${encoded("Enter a valid email and a password of at least 8 characters.")}`);
  }

  const supabase = await createClient();
  const origin = await requestOrigin();
  const { data, error } = await supabase.auth.signUp({
    email: email.data,
    password: password.data,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/onboarding/profile`,
    },
  });

  if (error) redirect(`/register?error=${encoded(error.message)}`);
  if (data.session) redirect("/onboarding/profile");
  redirect(`/login?message=${encoded("Check your email to confirm your account, then continue onboarding.")}`);
}

export async function signInWithPassword(formData: FormData) {
  const email = emailSchema.safeParse(formData.get("email"));
  const password = passwordSchema.safeParse(formData.get("password"));

  if (!email.success || !password.success) {
    redirect(`/login?error=${encoded("Enter a valid email and password.")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: email.data,
    password: password.data,
  });

  if (error) redirect(`/login?error=${encoded(error.message)}`);
  redirect("/workspace");
}

export async function sendMagicLink(formData: FormData) {
  const email = emailSchema.safeParse(formData.get("email"));
  if (!email.success) redirect(`/login?error=${encoded("Enter a valid email address.")}`);

  const supabase = await createClient();
  const origin = await requestOrigin();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/workspace`,
    },
  });

  if (error) redirect(`/login?error=${encoded(error.message)}`);
  redirect(`/login?message=${encoded("Magic link sent. Check your email.")}`);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

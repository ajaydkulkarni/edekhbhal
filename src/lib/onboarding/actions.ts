"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { withAuthSubject } from "@/db/runtime";
import { requireAuthenticatedUser } from "@/lib/auth/server-session";
import { getOnboardingSnapshot } from "@/lib/onboarding/server";

const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
});

const organizationSchema = z.object({
  name: z.string().trim().min(2).max(160),
  countryCode: z.string().trim().length(2),
  currencyCode: z.string().trim().length(3),
  timezone: z.string().trim().min(3).max(80),
});

const siteSchema = z.object({
  name: z.string().trim().min(2).max(160),
  code: z.string().trim().min(2).max(32),
  timezone: z.string().trim().min(3).max(80),
  countryCode: z.string().trim().length(2),
  addressLine1: z.string().trim().max(200).optional().default(""),
  city: z.string().trim().max(100).optional().default(""),
  region: z.string().trim().max(100).optional().default(""),
  postalCode: z.string().trim().max(40).optional().default(""),
});

function errorUrl(path: string, message: string) {
  return `${path}?error=${encodeURIComponent(message)}`;
}

export async function completeProfile(formData: FormData) {
  const user = await requireAuthenticatedUser();
  const parsed = profileSchema.safeParse({
    displayName: formData.get("displayName"),
  });

  if (!parsed.success) redirect(errorUrl("/onboarding/profile", "Enter your full name."));

  await withAuthSubject(user.id, async (tx) => {
    await tx`
      select app_private.upsert_current_app_user(
        ${user.email ?? ""},
        ${parsed.data.displayName}
      )
    `;
  });

  redirect("/onboarding/organization");
}

export async function createOrganization(formData: FormData) {
  const user = await requireAuthenticatedUser();
  const parsed = organizationSchema.safeParse({
    name: formData.get("name"),
    countryCode: formData.get("countryCode"),
    currencyCode: formData.get("currencyCode"),
    timezone: formData.get("timezone"),
  });

  if (!parsed.success) {
    redirect(errorUrl("/onboarding/organization", "Complete all Organization fields with valid country, currency, and timezone values."));
  }

  try {
    await withAuthSubject(user.id, async (tx) => {
      await tx`
        select * from app_private.bootstrap_current_organization(
          ${parsed.data.name},
          ${parsed.data.countryCode},
          ${parsed.data.currencyCode},
          ${parsed.data.timezone}
        )
      `;
    });
  } catch (error) {
    redirect(errorUrl("/onboarding/organization", error instanceof Error ? error.message : "Organization creation failed."));
  }

  redirect("/onboarding/plan");
}

export async function activateFreeBeta() {
  const user = await requireAuthenticatedUser();
  const snapshot = await getOnboardingSnapshot(user.id);
  if (!snapshot?.organization_id) redirect("/onboarding/organization");

  await withAuthSubject(user.id, async (tx) => {
    await tx`
      select app_private.activate_current_free_plan(
        ${snapshot.organization_id},
        'FREE_BETA'
      )
    `;
  });

  redirect("/onboarding/site");
}

export async function createFirstSite(formData: FormData) {
  const user = await requireAuthenticatedUser();
  const snapshot = await getOnboardingSnapshot(user.id);
  if (!snapshot?.organization_id) redirect("/onboarding/organization");

  const parsed = siteSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
    timezone: formData.get("timezone"),
    countryCode: formData.get("countryCode"),
    addressLine1: formData.get("addressLine1") ?? "",
    city: formData.get("city") ?? "",
    region: formData.get("region") ?? "",
    postalCode: formData.get("postalCode") ?? "",
  });

  if (!parsed.success) redirect(errorUrl("/onboarding/site", "Enter valid Site details."));

  try {
    await withAuthSubject(user.id, async (tx) => {
      await tx`
        select app_private.create_current_first_site(
          ${snapshot.organization_id},
          ${parsed.data.name},
          ${parsed.data.code},
          ${parsed.data.timezone},
          ${parsed.data.countryCode},
          ${parsed.data.addressLine1},
          ${parsed.data.city},
          ${parsed.data.region},
          ${parsed.data.postalCode}
        )
      `;
    });
  } catch (error) {
    redirect(errorUrl("/onboarding/site", error instanceof Error ? error.message : "Site creation failed."));
  }

  redirect("/workspace");
}

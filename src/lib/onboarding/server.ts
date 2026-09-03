import { withAuthSubject } from "@/db/runtime";
import type { OnboardingState } from "@/lib/onboarding";

export type OnboardingSnapshot = {
  app_user_id: string | null;
  display_name: string | null;
  organization_id: string | null;
  organization_name: string | null;
  membership_id: string | null;
  role_code: "ADMIN" | "SITE_MANAGER" | "USER" | null;
  plan_code: string | null;
  subscription_state: "ACTIVE" | "PENDING_PAYMENT" | "GRACE" | "SUSPENDED" | "CANCELLED" | null;
  site_id: string | null;
  site_name: string | null;
  onboarding_state: OnboardingState;
};

export async function getOnboardingSnapshot(authSubject: string) {
  return withAuthSubject(authSubject, async (tx) => {
    const rows = await tx<OnboardingSnapshot[]>`
      select * from app_private.get_current_onboarding_snapshot()
    `;
    return rows[0];
  });
}

export function onboardingPath(state: OnboardingState) {
  switch (state) {
    case "REGISTERED":
      return "/onboarding/profile";
    case "PROFILE_COMPLETED":
      return "/onboarding/organization";
    case "ORGANIZATION_CREATED":
    case "PLAN_SELECTED":
      return "/onboarding/plan";
    case "BILLING_COMPLETE":
    case "FREE_OR_SPONSORED_ACTIVATED":
      return "/onboarding/site";
    case "FIRST_SITE_CREATED":
    case "ONBOARDING_COMPLETE":
      return "/workspace";
  }
}

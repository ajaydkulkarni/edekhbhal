export const onboardingStates = [
  "REGISTERED",
  "PROFILE_COMPLETED",
  "ORGANIZATION_CREATED",
  "PLAN_SELECTED",
  "BILLING_COMPLETE",
  "FREE_OR_SPONSORED_ACTIVATED",
  "FIRST_SITE_CREATED",
  "ONBOARDING_COMPLETE",
] as const;

export type OnboardingState = (typeof onboardingStates)[number];

const allowedTransitions: Record<OnboardingState, readonly OnboardingState[]> = {
  REGISTERED: ["PROFILE_COMPLETED"],
  PROFILE_COMPLETED: ["ORGANIZATION_CREATED"],
  ORGANIZATION_CREATED: ["PLAN_SELECTED"],
  PLAN_SELECTED: ["BILLING_COMPLETE", "FREE_OR_SPONSORED_ACTIVATED"],
  BILLING_COMPLETE: ["FIRST_SITE_CREATED"],
  FREE_OR_SPONSORED_ACTIVATED: ["FIRST_SITE_CREATED"],
  FIRST_SITE_CREATED: ["ONBOARDING_COMPLETE"],
  ONBOARDING_COMPLETE: [],
};

export function canAdvanceOnboarding(
  from: OnboardingState,
  to: OnboardingState,
): boolean {
  return allowedTransitions[from].includes(to);
}

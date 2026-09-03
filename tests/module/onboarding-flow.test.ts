import { describe, expect, it } from "vitest";
import { canAdvanceOnboarding } from "@/lib/onboarding";
import { onboardingPath } from "@/lib/onboarding/server";

describe("guided onboarding flow", () => {
  it("preserves the locked onboarding sequence", () => {
    expect(canAdvanceOnboarding("REGISTERED", "PROFILE_COMPLETED")).toBe(true);
    expect(canAdvanceOnboarding("PROFILE_COMPLETED", "ORGANIZATION_CREATED")).toBe(true);
    expect(canAdvanceOnboarding("ORGANIZATION_CREATED", "PLAN_SELECTED")).toBe(true);
    expect(canAdvanceOnboarding("PLAN_SELECTED", "FREE_OR_SPONSORED_ACTIVATED")).toBe(true);
    expect(canAdvanceOnboarding("FREE_OR_SPONSORED_ACTIVATED", "FIRST_SITE_CREATED")).toBe(true);
    expect(canAdvanceOnboarding("FIRST_SITE_CREATED", "ONBOARDING_COMPLETE")).toBe(true);
  });

  it("routes incomplete users to the correct guided step", () => {
    expect(onboardingPath("REGISTERED")).toBe("/onboarding/profile");
    expect(onboardingPath("PROFILE_COMPLETED")).toBe("/onboarding/organization");
    expect(onboardingPath("ORGANIZATION_CREATED")).toBe("/onboarding/plan");
    expect(onboardingPath("FREE_OR_SPONSORED_ACTIVATED")).toBe("/onboarding/site");
    expect(onboardingPath("ONBOARDING_COMPLETE")).toBe("/workspace");
  });
});

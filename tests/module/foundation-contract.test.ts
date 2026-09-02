import { describe, expect, it } from "vitest";
import { brand } from "@/lib/brand";
import { onboardingStates } from "@/lib/onboarding";

describe("Foundation 0 product contract", () => {
  it("remains product-name configurable", () => {
    expect(brand.productName.length).toBeGreaterThan(0);
  });

  it("includes the required guided onboarding endpoints", () => {
    expect(onboardingStates).toContain("ORGANIZATION_CREATED");
    expect(onboardingStates).toContain("PLAN_SELECTED");
    expect(onboardingStates).toContain("FIRST_SITE_CREATED");
  });
});

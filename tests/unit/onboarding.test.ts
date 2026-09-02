import { describe, expect, it } from "vitest";
import { canAdvanceOnboarding } from "@/lib/onboarding";

describe("onboarding state machine", () => {
  it("accepts the paid path", () => {
    expect(canAdvanceOnboarding("PLAN_SELECTED", "BILLING_COMPLETE")).toBe(true);
  });

  it("accepts the free/sponsored path", () => {
    expect(canAdvanceOnboarding("PLAN_SELECTED", "FREE_OR_SPONSORED_ACTIVATED")).toBe(true);
  });

  it("rejects skipping Organization creation", () => {
    expect(canAdvanceOnboarding("PROFILE_COMPLETED", "PLAN_SELECTED")).toBe(false);
  });
});

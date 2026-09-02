import { describe, expect, it } from "vitest";
import { parseTenantContext } from "@/lib/tenant-context";

describe("tenant context", () => {
  it("requires user, organization, and membership UUIDs", () => {
    const parsed = parseTenantContext({
      userId: "11111111-1111-4111-8111-111111111111",
      organizationId: "22222222-2222-4222-8222-222222222222",
      membershipId: "33333333-3333-4333-8333-333333333333",
    });
    expect(parsed.organizationId).toBe("22222222-2222-4222-8222-222222222222");
  });

  it("rejects incomplete contexts", () => {
    expect(() => parseTenantContext({ userId: "x" })).toThrow();
  });
});

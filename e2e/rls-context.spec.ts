import { test, expect } from "@playwright/test";
import { e2eSecret } from "./helpers";

type Snapshot = {
  userId: string | null;
  organizationId: string | null;
  membershipId: string | null;
  role: string | null;
};

type Diagnostic = {
  outsideBefore: Snapshot;
  insideAdmin: Snapshot;
  freshTransactionAfterAdmin: Snapshot;
  insidePm: Snapshot;
  freshTransactionAfterPm: Snapshot;
  outsideAfter: Snapshot;
  checks: Record<string, boolean>;
};

function expectEmpty(snapshot: Snapshot) {
  expect(snapshot.userId).toBeFalsy();
  expect(snapshot.organizationId).toBeFalsy();
  expect(snapshot.membershipId).toBeFalsy();
  expect(snapshot.role).toBeFalsy();
}

test.describe("RLS runtime foundation", () => {
  test("tenant context is visible only inside its transaction", async ({ request }) => {
    const response = await request.post("/api/e2e/rls-context", {
      headers: { "x-e2e-secret": e2eSecret() }
    });

    expect(response.ok(), await response.text()).toBeTruthy();
    const body = await response.json() as Diagnostic;

    expect(body.insideAdmin.userId).toBeTruthy();
    expect(body.insideAdmin.organizationId).toBeTruthy();
    expect(body.insideAdmin.membershipId).toBeTruthy();
    expect(body.insideAdmin.role).toBe("ADMIN");

    expect(body.insidePm.userId).toBeTruthy();
    expect(body.insidePm.organizationId).toBe(body.insideAdmin.organizationId);
    expect(body.insidePm.membershipId).toBeTruthy();
    expect(body.insidePm.role).toBe("PROPERTY_MANAGER");

    expect(body.insideAdmin.userId).not.toBe(body.insidePm.userId);
    expect(body.insideAdmin.membershipId).not.toBe(body.insidePm.membershipId);
  });

  test("transaction-local tenant context does not leak", async ({ request }) => {
    const response = await request.post("/api/e2e/rls-context", {
      headers: { "x-e2e-secret": e2eSecret() }
    });

    expect(response.ok(), await response.text()).toBeTruthy();
    const body = await response.json() as Diagnostic;

    expectEmpty(body.outsideBefore);
    expectEmpty(body.freshTransactionAfterAdmin);
    expectEmpty(body.freshTransactionAfterPm);
    expectEmpty(body.outsideAfter);

    expect(body.checks).toEqual({
      outsideBeforeEmpty: true,
      adminMatches: true,
      freshAfterAdminEmpty: true,
      pmMatches: true,
      freshAfterPmEmpty: true,
      outsideAfterEmpty: true,
      identitiesDiffer: true
    });
  });

  test("RLS diagnostic endpoint rejects a missing E2E secret", async ({ request }) => {
    const response = await request.post("/api/e2e/rls-context");
    expect(response.status()).toBe(403);
  });
});

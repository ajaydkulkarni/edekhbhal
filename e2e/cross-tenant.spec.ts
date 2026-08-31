import { test, expect } from "@playwright/test";
import { accountEmails, login, setupFixtures } from "./helpers";

function expectDenied(status: number) {
  expect([400, 401, 403, 404]).toContain(status);
}

test.describe("cross-tenant isolation", () => {
  test("Admin cannot create a Property in another Organization", async ({ page, request }) => {
    const f = await setupFixtures(request);
    await login(page, accountEmails().admin);

    const response = await page.request.post("/api/properties", {
      data: {
        organizationId: f.foreignOrganization.id,
        name: `[E2E] forbidden property ${Date.now()}`,
        timezone: "America/Denver"
      }
    });

    expectDenied(response.status());
  });

  test("Admin cannot update another Organization Property", async ({ page, request }) => {
    const f = await setupFixtures(request);
    await login(page, accountEmails().admin);

    const response = await page.request.patch(`/api/properties/${f.foreignOrganization.property.id}`, {
      data: { name: "E2E SHOULD NEVER REPLACE FOREIGN PROPERTY" }
    });

    expectDenied(response.status());
  });

  test("Admin cannot update another Organization Work Area", async ({ page, request }) => {
    const f = await setupFixtures(request);
    await login(page, accountEmails().admin);

    const response = await page.request.patch(`/api/work-areas/${f.foreignOrganization.workArea.id}`, {
      data: { name: "E2E SHOULD NEVER REPLACE FOREIGN WORK AREA" }
    });

    expectDenied(response.status());
  });

  test("Admin cannot update another Organization Task", async ({ page, request }) => {
    const f = await setupFixtures(request);
    await login(page, accountEmails().admin);

    const response = await page.request.patch(`/api/tasks/${f.foreignOrganization.task.id}`, {
      data: { name: "E2E SHOULD NEVER REPLACE FOREIGN TASK" }
    });

    expectDenied(response.status());
  });

  test("Admin cannot change another Organization Schedule status", async ({ page, request }) => {
    const f = await setupFixtures(request);
    await login(page, accountEmails().admin);

    const response = await page.request.patch(`/api/schedules/${f.foreignOrganization.schedule.id}`, {
      data: { status: "INACTIVE" }
    });

    expectDenied(response.status());
  });

  test("Admin lists do not expose another Organization master data", async ({ page, request }) => {
    const f = await setupFixtures(request);
    await login(page, accountEmails().admin);

    await page.goto("/properties");
    await expect(page.getByText(f.foreignOrganization.property.name, { exact: false })).toHaveCount(0);

    await page.goto("/work-areas");
    await expect(page.getByText(f.foreignOrganization.workArea.name, { exact: false })).toHaveCount(0);

    await page.goto("/tasks");
    await expect(page.getByText(f.foreignOrganization.task.name, { exact: false })).toHaveCount(0);

    await page.goto("/schedules");
    await expect(page.getByText(f.foreignOrganization.schedule.name, { exact: false })).toHaveCount(0);
  });

  test("Property Manager cannot open another Organization Property", async ({ page, request }) => {
    const f = await setupFixtures(request);
    await login(page, accountEmails().pm);

    await page.goto(`/properties/${f.foreignOrganization.property.id}`);
    await expect(page.locator("body")).toContainText(/not found|could not be found|access|forbidden/i);
  });

  test("User cannot open another Organization Property", async ({ page, request }) => {
    const f = await setupFixtures(request);
    await login(page, accountEmails().user);

    await page.goto(`/properties/${f.foreignOrganization.property.id}`);
    await expect(page.locator("body")).toContainText(/not found|could not be found|access|forbidden/i);
  });
});

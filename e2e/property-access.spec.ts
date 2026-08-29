import { test, expect } from "@playwright/test";
import { accountEmails, login, setupFixtures } from "./helpers";

test("Admin sees both E2E Properties", async ({ page, request }) => {
  const f = await setupFixtures(request);
  await login(page, accountEmails().admin);
  await page.goto("/properties");
  await expect(page.getByText(f.propertyA.name, { exact: false })).toBeVisible();
  await expect(page.getByText(f.propertyB.name, { exact: false })).toBeVisible();
});

test("Property Manager sees assigned Property A but not Property B", async ({ page, request }) => {
  const f = await setupFixtures(request);
  await login(page, accountEmails().pm);
  await page.goto("/properties");
  await expect(page.getByText(f.propertyA.name, { exact: false })).toBeVisible();
  await expect(page.getByText(f.propertyB.name, { exact: false })).toHaveCount(0);
});

test("Property Manager cannot update Property master through API", async ({ page, request }) => {
  const f = await setupFixtures(request);
  await login(page, accountEmails().pm);
  const response = await page.request.patch(`/api/properties/${f.propertyA.id}`, {
    data: { name: `${f.propertyA.name} SHOULD NOT CHANGE` }
  });
  expect([401, 403, 404]).toContain(response.status());
});

test("Property Manager cannot access unassigned Property B detail", async ({ page, request }) => {
  const f = await setupFixtures(request);
  await login(page, accountEmails().pm);
  await page.goto(`/properties/${f.propertyB.id}`);
  await expect(page.locator("body")).toContainText(/not found|could not be found|access/i);
});

test("User cannot open another Team Member profile", async ({ page, request }) => {
  const f = await setupFixtures(request);
  await login(page, accountEmails().user);
  await page.goto(`/team/${f.pm.membershipId}`);
  await expect(page.locator("body")).toContainText(/not found|could not be found/i);
});

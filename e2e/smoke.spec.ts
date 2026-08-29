import { test, expect } from "@playwright/test";
import { accountEmails, login, setupFixtures } from "./helpers";

test.beforeAll(async ({ request }) => { await setupFixtures(request); });

test("admin can open key web screens", async ({ page }) => {
  await login(page, accountEmails().admin);
  for (const path of ["/dashboard", "/properties", "/team", "/audit", "/reports"]) {
    await page.goto(path);
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("body")).not.toContainText("This page could not be found");
  }
});

test("Property Manager can open own full self-service profile", async ({ page, request }) => {
  const fixtures = await setupFixtures(request);
  await login(page, accountEmails().pm);
  await page.goto(`/team/${fixtures.pm.membershipId}`);
  await expect(page.locator("body")).not.toContainText("This page could not be found");
  await expect(page.getByText(fixtures.pm.email, { exact: false })).toBeVisible();
});

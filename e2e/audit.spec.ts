import { test, expect } from "@playwright/test";
import { accountEmails, login, setupFixtures } from "./helpers";

test.beforeAll(async ({ request }) => { await setupFixtures(request); });

test("Audit Trail opens and export endpoints respond", async ({ page }) => {
  await login(page, accountEmails().admin);
  await page.goto("/audit");
  await expect(page.getByRole("heading", { name: "Audit Trail" })).toBeVisible();
  const csv = await page.request.get("/api/audit/export?format=csv");
  expect(csv.ok()).toBeTruthy();
  const xlsx = await page.request.get("/api/audit/export?format=xlsx");
  expect(xlsx.ok()).toBeTruthy();
});

import { test, expect } from "@playwright/test";
import { accountEmails, login, setupFixtures } from "./helpers";

test.describe("Demo Workspace", () => {
  test("Admin can switch to the universal Demo Workspace", async ({ page, request }) => {
    await setupFixtures(request);
    await login(page, accountEmails().admin);

    const workspace = page.getByLabel("Workspace");
    await expect(workspace).toBeVisible();
    await workspace.selectOption("DEMO");

    await expect(page).toHaveURL(/\/demo\/dashboard$/);
    await expect(page.getByText("DEMO WORKSPACE — Sample data", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "eDekhbhal Best Practice Demo" })).toBeVisible();
    await expect(page.getByText("Butter Chicken Bowl — Lot Production", { exact: true })).toBeVisible();
  });

  test("Demo Reports contain deterministic real-life exceptions", async ({ page, request }) => {
    await setupFixtures(request);
    await login(page, accountEmails().admin);
    await page.goto("/demo/reports");

    await expect(page.getByRole("heading", { name: "Demo Reports — Last 30 Days" })).toBeVisible();
    await expect(page.getByText("Schedule performance", { exact: true })).toBeVisible();
    await expect(page.getByText("Recent exception samples", { exact: true })).toBeVisible();
    await expect(page.locator("table").first().locator("tbody tr").first()).toBeVisible();
  });

  test("Demo Task can prefill the real Add Task form without writing immediately", async ({ page, request }) => {
    await setupFixtures(request);
    await login(page, accountEmails().admin);
    await page.goto("/demo/tasks");

    const taskCard = page.locator("article").filter({ hasText: "Guest Room Readiness Inspection" });
    await taskCard.getByRole("link", { name: "Use this Task as a template" }).click();

    await expect(page).toHaveURL(/\/tasks\/new\?demoTask=guest-room-readiness$/);
    await expect(page.getByRole("heading", { name: "Create Task from Best Practice Template" })).toBeVisible();
    await expect(page.locator('textarea[name="name"]')).toHaveValue("Guest Room Readiness Inspection");
  });

  test("Public Demo QR works without an authenticated session", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("/demo-qr/hotel-lobby");
    await expect(page.getByText("DEMO WORKSPACE — Sample data", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Main Lobby" })).toBeVisible();
    await expect(page.getByText("Demo only — mobile execution disabled", { exact: true })).toBeVisible();
    await expect(page.getByRole("img", { name: /Demo QR for Main Lobby/ })).toBeVisible();

    await context.close();
  });

  test("Demo role simulator is available to every real role", async ({ page, request }) => {
    await setupFixtures(request);
    await login(page, accountEmails().user);
    await page.goto("/demo/dashboard");

    await expect(page.getByRole("button", { name: "Admin" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Property Manager" })).toBeVisible();
    await expect(page.getByRole("button", { name: "User", exact: true })).toBeVisible();
  });
});

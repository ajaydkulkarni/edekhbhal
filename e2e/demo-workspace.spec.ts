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
  });

  test("Demo Dashboard mirrors the real live-operations sections", async ({ page, request }) => {
    await setupFixtures(request);
    await login(page, accountEmails().admin);
    await page.goto("/demo/dashboard");

    await expect(page.getByRole("heading", { name: "Today at a glance" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Latest photos & videos" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Who is active now" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Attention required" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Task completions" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Schedule progress" })).toBeVisible();

    await expect(page.getByText(/online/).first()).toBeVisible();
    await expect(page.locator(".presenceBadge.working").first()).toBeVisible();
    await expect(page.locator(".presenceBadge.offline").first()).toBeVisible();
    await expect(page.getByRole("img", { name: /Demo evidence:/ }).first()).toBeVisible();
  });

  test("Demo dropdown closes after submenu navigation", async ({ page, request }) => {
    await setupFixtures(request);
    await login(page, accountEmails().admin);
    await page.goto("/demo/dashboard");

    const operations = page.locator("details.navMenu").filter({ hasText: "Operations" }).first();
    await operations.locator("summary").click();
    await expect(operations).toHaveAttribute("open", "");

    await operations.getByRole("link", { name: /Properties/ }).click();
    await expect(page).toHaveURL(/\/demo\/properties$/);
    await expect(operations).not.toHaveAttribute("open", "");
  });

  test("Demo Reports contain deterministic real-life exceptions", async ({ page, request }) => {
    await setupFixtures(request);
    await login(page, accountEmails().admin);
    await page.goto("/demo/reports");
    await expect(page.getByRole("heading", { name: "Demo Reports — Last 30 Days" })).toBeVisible();
    await expect(page.getByText("Schedule performance", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recent exception samples" })).toBeVisible();
    await expect(page.locator("table").first().locator("tbody tr").first()).toBeVisible();
  });

  test("Demo Task detail resembles the real Task definition and can prefill a real Task", async ({ page, request }) => {
    await setupFixtures(request);
    await login(page, accountEmails().admin);
    await page.goto("/demo/tasks/guest-room-readiness");
    await expect(page.getByRole("heading", { name: "Task", exact: true })).toBeVisible();
    await expect(page.locator('textarea[name="name"]')).toHaveValue("Guest Room Readiness Inspection");
    await page.getByRole("link", { name: "Use this Task as a template" }).click();
    await expect(page).toHaveURL(/\/tasks\/new\?demoTask=guest-room-readiness$/);
    await expect(page.getByRole("heading", { name: "Create Task from Best Practice Template" })).toBeVisible();
  });

  test("Demo Schedule opens a real-like read-only definition with ordered Tasks", async ({ page, request }) => {
    await setupFixtures(request);
    await login(page, accountEmails().admin);
    await page.goto("/demo/schedules/lot-butter-chicken");
    await expect(page.getByRole("heading", { name: "Butter Chicken Bowl — Lot Production" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Schedule Definition" })).toBeVisible();
    await expect(page.getByText("Ordered Tasks", { exact: true })).toBeVisible();
    await expect(page.getByText("Butter Chicken Bowl — Cooking & Critical Temperature Check", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Generated / Recent Occurrences" })).toBeVisible();
  });

  test("Demo Property supports the same three detail tabs as a real Property", async ({ page, request }) => {
    await setupFixtures(request);
    await login(page, accountEmails().admin);
    await page.goto("/demo/properties/freshbite-foods");
    await expect(page.getByRole("heading", { name: "FreshBite Foods Manufacturing Plant" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Property Details" })).toBeVisible();
    await page.getByRole("link", { name: "Work Areas" }).click();
    await expect(page.getByText("Line 1 — Prepared Meals", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Team Assignments" }).click();
    await expect(page.getByText("Sofia Martinez", { exact: true })).toBeVisible();
  });

  test("Demo Work Area exposes service status and public Demo QR", async ({ page, request }) => {
    await setupFixtures(request);
    await login(page, accountEmails().admin);
    await page.goto("/demo/work-areas/line-1-bowls");
    await expect(page.getByRole("heading", { name: "Line 1 — Prepared Meals" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Service Status" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Demo Public QR" })).toBeVisible();
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

  test("Demo role simulator changes server-rendered Demo perspective", async ({ page, request }) => {
    await setupFixtures(request);
    await login(page, accountEmails().user);
    await page.goto("/demo/dashboard");
    await expect(page.getByRole("button", { name: "Admin" })).toBeVisible();
    await page.getByRole("button", { name: "Property Manager" }).click();
    await expect(page.getByText(/Assigned-Property operations for FreshBite Foods Manufacturing Plant/)).toBeVisible();
    await page.getByRole("button", { name: "User", exact: true }).click();
    await expect(page.getByText("Sample assigned work and read-only operational context for a field User.", { exact: true })).toBeVisible();
  });
});

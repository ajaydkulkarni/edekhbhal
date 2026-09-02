import { test, expect } from "@playwright/test";
import { accountEmails, e2eSecret, login, mobileLogin, setupFixtures } from "./helpers";

async function reportedFixture(request: any) {
  const setup: any = await setupFixtures(request);
  const response = await request.post("/api/e2e/reported-work", {
    headers: { "x-e2e-secret": e2eSecret() },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return { ...setup, ...(await response.json()) } as any;
}

function localStart() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

test.describe("combined build 01", () => {
  test("Dashboard refresh removes Create Schedule after reported work is linked", async ({ page, request }) => {
    const fixture = await reportedFixture(request);
    const token = await mobileLogin(request, accountEmails().user);
    const note = `[E2E] dashboard resume ${Date.now()}`;
    const createdResponse = await request.post(
      `/api/mobile/occurrence-tasks/${fixture.occurrenceTaskA.id}/notes`,
      { headers: { Authorization: `Bearer ${token}` }, data: { note } },
    );
    expect(createdResponse.ok(), await createdResponse.text()).toBeTruthy();
    const created = await createdResponse.json();

    await login(page, accountEmails().admin);
    await page.goto("/dashboard");
    const card = page.locator(".reportedWorkAttention").filter({ hasText: note });
    await expect(card).toBeVisible();
    await expect(card.getByRole("link", { name: "Create Schedule" })).toBeVisible();

    const scheduleResponse = await page.request.post("/api/schedules", {
      data: {
        name: `[E2E] linked ${Date.now()}`,
        documentReference: "QMS-COR-009",
        documentRevision: "Rev 01",
        frequencyType: "ONE_TIME",
        recurrenceUnit: null,
        recurrenceInterval: null,
        recurrenceConfig: null,
        startLocal: localStart(),
        endDate: null,
        timezone: "America/Denver",
        workAreaId: fixture.workAreaA.id,
        reportedWorkItemId: created.reportedWorkItemId,
        tasks: [{
          taskId: fixture.taskA.id,
          sequence: 1,
          duration: "00:15",
          evidenceRule: "NONE",
          randomEveryN: null,
          randomEvidenceType: null,
        }],
      },
    });
    expect(scheduleResponse.ok(), await scheduleResponse.text()).toBeTruthy();

    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(card).toHaveCount(0);
  });

  test("Schedule document reference and revision can be saved", async ({ page, request }) => {
    const fixture = await setupFixtures(request);
    await login(page, accountEmails().admin);
    await page.goto(`/schedules/${fixture.nextSchedule.id}`);

    const reference = `ISO-E2E-${Date.now()}`;
    await page.getByLabel("Document / SOP Reference No.").fill(reference);
    await page.getByLabel("Revision / Version").fill("Rev 07");

    const patch = page.waitForResponse((response) =>
      response.url().includes(`/api/schedules/${fixture.nextSchedule.id}`) &&
      response.request().method() === "PATCH",
    );
    await page.getByRole("button", { name: "Save Schedule" }).click();
    const response = await patch;
    expect(response.ok(), await response.text()).toBeTruthy();

    await expect(page.getByLabel("Document / SOP Reference No.")).toHaveValue(reference);
    await expect(page.getByLabel("Revision / Version")).toHaveValue("Rev 07");
  });

  test("Work Area QR preview is 4x6 oriented and exposes no QR ID", async ({ page, request }) => {
    const fixture = await setupFixtures(request);
    await login(page, accountEmails().admin);
    await page.goto("/work-areas");
    const row = page.locator("tbody tr").filter({ hasText: fixture.nextWorkArea.name });
    await row.getByRole("button", { name: "View / Reprint QR" }).click();
    await expect(page.getByText("Scan for Service Information", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Print 4 × 6 Label" })).toBeVisible();
    await expect(page.getByText(/QR ID:/)).toHaveCount(0);
  });

  test("Demo shows controlled-document examples, real reference photos and QR label", async ({ page }) => {
    await login(page, accountEmails().admin);

    await page.goto("/demo/schedules/lot-butter-chicken");
    await expect(page.getByLabel("Document / SOP Reference No.")).toHaveValue("FS-QMS-PRD-021");
    await expect(page.getByLabel("Revision / Version")).toHaveValue("Rev 04");

    await page.goto("/demo/dashboard");
    await expect(page.getByText("Sample evidence · real-world reference photos", { exact: true })).toBeVisible();
    const image = page.locator(".featuredEvidenceMedia img").first();
    await expect(image).toHaveAttribute("src", /upload\.wikimedia\.org/);

    await page.goto("/demo/work-areas/line-1-bowls/qr-label");
    await expect(page.getByText("Scan for Service Information", { exact: true })).toBeVisible();
    await expect(page.getByText(/QR ID:/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Print 4 × 6 Demo Label" })).toBeVisible();
  });
});

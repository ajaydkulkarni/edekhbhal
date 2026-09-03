import { expect, test } from "@playwright/test";

test("Demo explains Work Area QR and Task Master lifecycle safely", async ({ page }) => {
  await page.goto("/demo");

  await expect(page.getByText("WORK AREA + QR DEMO")).toBeVisible();
  await expect(page.getByText("Reprint", { exact: true })).toBeVisible();
  await expect(page.getByText("Regenerate", { exact: true })).toBeVisible();
  await expect(page.getByText(/QR never grants authorization/)).toBeVisible();

  await expect(page.getByText("TASK MASTER DEMO")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Reusable Organization-level Tasks" })).toBeVisible();
  await expect(page.getByText("Clean main entrance glass")).toBeVisible();
  const firstTask = page.getByRole("article").filter({ hasText: "Clean main entrance glass" });
  await expect(firstTask.getByText(/no Base64 media/i)).toBeVisible();
  await expect(page.getByText(/USER is read-only/i)).toBeVisible();
});

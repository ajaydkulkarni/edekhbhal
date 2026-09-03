import { expect, test } from "@playwright/test";

test("Demo explains Work Area QR lifecycle safely", async ({ page }) => {
  await page.goto("/demo");
  await expect(page.getByText("WORK AREA + QR DEMO")).toBeVisible();
  await expect(page.getByText("Reprint", { exact: true })).toBeVisible();
  await expect(page.getByText("Regenerate", { exact: true })).toBeVisible();
  await expect(page.getByText(/QR never grants authorization/)).toBeVisible();
});

import { expect, test } from "@playwright/test";

test("landing page exposes the primary product paths", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Every task");
  await expect(page.getByRole("link", { name: "Start free" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "View Demo" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
});

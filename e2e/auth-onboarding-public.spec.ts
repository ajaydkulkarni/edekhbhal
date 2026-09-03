import { expect, test } from "@playwright/test";

test("public auth and Demo onboarding paths render", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send magic link" })).toBeVisible();

  await page.goto("/register");
  await expect(page.getByRole("heading", { name: "Create your account." })).toBeVisible();

  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: /Explore .*/ })).toBeVisible();
  await expect(page.getByText("Demo safety boundary")).toBeVisible();
  await expect(page.getByText("First Site")).toBeVisible();
});

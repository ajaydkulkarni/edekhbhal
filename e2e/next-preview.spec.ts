import { test, expect } from "@playwright/test";
import { accountEmails, login, setupFixtures } from "./helpers";

test("V2 public landing exposes Login and Register entry points", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /login/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /register/i }).first()).toBeVisible();
});

test("Schedule detail shows latest active Work Area QR Code", async ({ page, request }) => {
  const fixtures = await setupFixtures(request);
  await login(page, accountEmails().admin);

  await page.goto(`/schedules/${fixtures.nextSchedule.id}`);
  await expect(page.getByRole("heading", { name: fixtures.nextSchedule.name })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Work Area QR Code" })).toBeVisible();
  await expect(page.getByText(fixtures.nextWorkArea.name, { exact: false }).first()).toBeVisible();

  const qrImage = page.getByRole("img", { name: `Latest QR Code for ${fixtures.nextWorkArea.name}` });
  await expect(qrImage).toBeVisible();
  await expect(qrImage).toHaveAttribute("src", /^data:image\/png;base64,/);

  const publicLink = page.getByRole("link", { name: "Open public QR page" });
  await expect(publicLink).toHaveAttribute("href", new RegExp(`/qr/${fixtures.nextQr.id}$`));
});

test("latest Schedule Work Area QR opens the public Work Area page without private data", async ({ page, request }) => {
  const fixtures = await setupFixtures(request);
  await page.goto(`/qr/${fixtures.nextQr.id}`);

  await expect(page.getByRole("heading", { name: fixtures.nextWorkArea.name })).toBeVisible();
  await expect(page.getByText(/public operational service information only/i)).toBeVisible();

  const body = page.locator("body");
  await expect(body).not.toContainText(accountEmails().admin);
  await expect(body).not.toContainText(accountEmails().pm);
  await expect(body).not.toContainText(accountEmails().user);
  await expect(body).not.toContainText(accountEmails().unassigned);
});

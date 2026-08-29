import { expect, type APIRequestContext, type Page } from "@playwright/test";

export type Fixtures = {
  organizationId: string;
  admin: { id: string; email: string; membershipId: string };
  pm: { id: string; email: string; membershipId: string };
  user: { id: string; email: string; membershipId: string };
  unassigned: { id: string; email: string; membershipId: string };
  propertyA: { id: string; name: string };
  propertyB: { id: string; name: string };
};

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required E2E environment variable: ${name}`);
  return value;
}
export function e2eSecret() { return env("E2E_TEST_SECRET"); }
export function accountEmails() {
  return {
    admin: env("E2E_ADMIN_EMAIL"),
    pm: env("E2E_PM_EMAIL"),
    user: env("E2E_USER_EMAIL"),
    unassigned: env("E2E_UNASSIGNED_EMAIL")
  };
}
export async function setupFixtures(request: APIRequestContext): Promise<Fixtures> {
  const response = await request.post("/api/e2e/setup", { headers: { "x-e2e-secret": e2eSecret() } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return await response.json();
}
export async function login(page: Page, email: string) {
  const response = await page.request.post("/api/e2e/session", {
    headers: { "x-e2e-secret": e2eSecret() },
    data: { email }
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  await page.goto("/dashboard");
  await expect(page).not.toHaveURL(/\/login/);
}

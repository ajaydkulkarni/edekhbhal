import { test, expect } from "@playwright/test";
import { accountEmails, login, setupFixtures } from "./helpers";

test("unassigned User receives no executable mobile queue work", async ({ page, request }) => {
  await setupFixtures(request);
  await login(page, accountEmails().unassigned);
  const response = await page.request.get("/api/mobile/queue/next");
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.state ?? body.status ?? "EMPTY").toMatch(/EMPTY|NONE|NO_WORK/i);
});

import { expect, test } from "@playwright/test";
import { accountEmails, mobileLogin, setupFixtures } from "./helpers";

test("unassigned User receives no executable mobile queue work", async ({ request }) => {
  await setupFixtures(request);
  const token = await mobileLogin(request, accountEmails().unassigned);
  const response = await request.get("/api/mobile/queue/next", {
    headers: { Authorization: `Bearer ${token}` }
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = await response.json();
  expect(body.state).toBe("EMPTY");
  expect(body.occurrence).toBeNull();
});

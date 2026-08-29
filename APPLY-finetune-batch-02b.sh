#!/usr/bin/env bash
set -euo pipefail
ROOT="$(pwd)"
if [ ! -f "$ROOT/package.json" ] || [ ! -d "$ROOT/src" ]; then
  echo "Run this script from the eDekhbhal repository root."; exit 1
fi

python3 - <<'PY'
from pathlib import Path

p=Path("src/app/api/e2e/session/route.ts")
text=p.read_text()
old='return NextResponse.json({ ok: true });'
new='return NextResponse.json({ ok: true, token });'
if old not in text and new not in text:
    raise SystemExit("Could not find expected E2E session response.")
text=text.replace(old,new)
p.write_text(text)

p=Path("e2e/helpers.ts")
text=p.read_text()
if "export async function mobileLogin" not in text:
    text += '''
export async function mobileLogin(request: APIRequestContext, email: string) {
  const response = await request.post("/api/e2e/session", {
    headers: { "x-e2e-secret": e2eSecret() },
    data: { email }
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = await response.json();
  expect(body.token).toBeTruthy();
  return body.token as string;
}
'''
p.write_text(text)

Path("e2e/mobile-api.spec.ts").write_text('''import { expect, test } from "@playwright/test";
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
''')

c=Path("PROJECT-CONTEXT.md")
text=c.read_text()
section = '''
### Fine-tuning Batch 02B — Mobile E2E Authentication Fix
- The first mostly-green live Playwright run passed 8/9 tests.
- The remaining mobile queue test was a test-harness mismatch, not an application authorization failure: mobile APIs require `Authorization: Bearer <session-token>`, while the Web E2E login helper only established the `edk_session` cookie.
- The staging-only E2E session helper now also returns its generated short-lived session token to an authenticated E2E caller.
- Mobile API E2E tests use that token as a Bearer token and assert the unassigned USER receives exactly `state: "EMPTY"` and `occurrence: null`.
'''
if "### Fine-tuning Batch 02B — Mobile E2E Authentication Fix" not in text:
    text += "\n\n" + section
c.write_text(text)
PY

echo "Fine-tuning Batch 02B applied."
echo "Next: bash CHECK-finetune-batch-02b.sh"

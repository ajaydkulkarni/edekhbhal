# Fine-tuning Batch 02 — Automated Functional Testing Foundation

Adds Playwright staging E2E automation without changing the semantic application version.

Required Vercel staging environment variables:
- E2E_TESTING_ENABLED=true
- E2E_TEST_SECRET=<strong random secret>
- E2E_ADMIN_EMAIL=<existing active Admin email in staging>
- E2E_PM_EMAIL=<dedicated automation PM email>
- E2E_USER_EMAIL=<dedicated automation assigned User email>
- E2E_UNASSIGNED_EMAIL=<dedicated automation unassigned User email>

Security:
- E2E endpoints are disabled when VERCEL_ENV=production.
- Every E2E request requires E2E_TEST_SECRET.
- Only explicitly configured emails can receive E2E sessions.
- Do not commit secret values.

Workflow:
1. Extract locally and upload all extracted files to GitHub preserving paths.
2. In Codespaces: git pull, APPLY, CHECK.
3. Push canonical changes.
4. Add Vercel staging E2E environment variables and redeploy.
5. Configure matching terminal/GitHub Actions secrets.
6. Install Chromium once: npx playwright install chromium
7. Run: npm run test:e2e

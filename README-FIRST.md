# Fine-tuning Batch 02A — E2E Runtime Hotfix

The first live E2E run exposed two infrastructure issues:

1. The dedicated staging Vercel project reports VERCEL_ENV=production for its production branch, so the original E2E guard incorrectly returned 404.
2. Codespaces Chromium was downloaded but Linux runtime libraries such as libatk were missing.

Fixes:
- E2E endpoints now require E2E_TESTING_ENABLED=true AND APP_URL=https://edekhbhal-staging.vercel.app.
- E2E_TEST_SECRET and explicit test-email allow-list checks remain required.
- The Playwright install script now uses --with-deps chromium.

No Supabase migration is required.

# Fine-tuning Batch 02B — Mobile E2E Authentication Fix

The live Playwright run passed 8 of 9 tests.

The only failure was the mobile queue test. The application mobile API correctly requires an `Authorization: Bearer <token>` header. The original E2E test used the Web session cookie instead, so the request was rejected before queue authorization was evaluated.

This patch:
- returns the short-lived token from the staging-only, secret-protected E2E session route;
- adds a `mobileLogin()` E2E helper;
- sends the Bearer token to `/api/mobile/queue/next`;
- verifies an unassigned USER receives exactly `state: "EMPTY"` and `occurrence: null`;
- updates PROJECT-CONTEXT.md.

No Supabase migration and no Vercel environment-variable changes are required.

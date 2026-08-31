# eDekhbhal Next Preview 02

This is the single combined release requested for:

1. **Schedule Work Area QR convenience**
   - Schedule detail displays the latest ACTIVE QR for its related Work Area.
   - Shows generated time.
   - Provides a functional link to the public QR page.
   - No active QR = clear empty state.

2. **V2 E2E regression enablement**
   - Playwright defaults to `https://edekhbhal.vercel.app`.
   - Server-side E2E endpoints explicitly allow only:
     - `https://edekhbhal.vercel.app`
     - `https://edekhbhal-staging.vercel.app`
   - Secret header and `E2E_TESTING_ENABLED=true` remain mandatory.
   - Adds 3 V2-specific regression tests.
   - Existing E2E tests are retained.

No SQL/database migration is required.

## Apply

Extract/upload the release contents to the repository root on branch `v2-rebuild`, preserving paths. Then in Codespaces:

```bash
cd /workspaces/edekhbhal
git switch v2-rebuild
git pull origin v2-rebuild
bash APPLY-next-preview-02.sh
bash CHECK-next-preview-02.sh
```

The static check performs Prisma format/generate, web TypeScript, production build,
Playwright test discovery, mobile TypeScript, and release marker validation.

## Before live V2 E2E

The Vercel project serving `https://edekhbhal.vercel.app` must have these environment
variables in the Production environment:

- `E2E_TESTING_ENABLED=true`
- `E2E_TEST_SECRET`
- `E2E_ADMIN_EMAIL`
- `E2E_PM_EMAIL`
- `E2E_USER_EMAIL`
- `E2E_UNASSIGNED_EMAIL`

Do not share the secret values in chat. After adding/changing these variables, redeploy V2.

Then set the same E2E values in the Codespaces shell and run:

```bash
bash RUN-V2-E2E.sh
```

Do not claim the V2 regression is green until that live run completes successfully.

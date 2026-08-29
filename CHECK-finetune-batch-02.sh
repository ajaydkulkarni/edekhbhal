#!/usr/bin/env bash
set -euo pipefail
echo "== Diff whitespace =="; git diff --check
echo "== Prisma generate =="; npm run db:generate
echo "== Web typecheck =="; npm run typecheck
echo "== Web production build =="; npm run build
echo "== Restore generated Web metadata =="; git restore next-env.d.ts tsconfig.tsbuildinfo 2>/dev/null || true
echo "== Playwright config discovery =="; npx playwright test --list
echo "== E2E sanity =="
grep -q '"test:e2e"' package.json
grep -q 'E2E_TESTING_ENABLED' src/app/api/e2e/session/route.ts
grep -q 'E2E Property A' src/app/api/e2e/setup/route.ts
grep -q 'Property Manager can open own full self-service profile' e2e/smoke.spec.ts
grep -q 'unassigned User receives no executable mobile queue work' e2e/mobile-api.spec.ts
echo "== Final git status =="; git status --short
echo "All automated Fine-tuning Batch 02 build/config checks completed successfully."
echo "NOTE: live E2E tests require deployed staging E2E environment variables."

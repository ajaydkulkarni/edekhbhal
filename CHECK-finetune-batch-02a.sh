#!/usr/bin/env bash
set -euo pipefail
echo "== Diff whitespace =="; git diff --check
echo "== Typecheck =="; npm run typecheck
echo "== Production build =="; npm run build
echo "== Restore generated Web metadata =="; git restore next-env.d.ts tsconfig.tsbuildinfo 2>/dev/null || true
echo "== Runtime hotfix sanity =="
grep -q 'appUrl === STAGING_APP_URL' src/app/api/e2e/session/route.ts
grep -q 'appUrl === STAGING_APP_URL' src/app/api/e2e/setup/route.ts
grep -q 'playwright install --with-deps chromium' package.json
echo "== Final git status =="; git status --short
echo "All automated Fine-tuning Batch 02A checks completed successfully."

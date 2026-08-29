#!/usr/bin/env bash
set -euo pipefail

echo "== Diff whitespace =="
git diff --check

echo "== Workflow presence =="
test -f .github/workflows/e2e-staging.yml
grep -q 'workflow_dispatch' .github/workflows/e2e-staging.yml
grep -q 'npm ci' .github/workflows/e2e-staging.yml
grep -q 'playwright install --with-deps chromium' .github/workflows/e2e-staging.yml
grep -q 'npm run test:e2e' .github/workflows/e2e-staging.yml

echo "== Package lock present =="
test -f package-lock.json

echo "== E2E discovery =="
npx playwright test --list

echo "== Context sanity =="
grep -q 'Live staging Playwright baseline is green: 9/9 tests passed' PROJECT-CONTEXT.md

echo "== Final git status =="
git status --short

echo "All Fine-tuning Batch 02C checks completed successfully."

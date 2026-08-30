#!/usr/bin/env bash
set -euo pipefail
git diff --check
npm run typecheck
npx playwright test --list
grep -q 'actions/checkout@v6' .github/workflows/e2e-staging.yml
grep -q 'actions/setup-node@v6' .github/workflows/e2e-staging.yml
grep -q 'node-version: 24' .github/workflows/e2e-staging.yml
grep -q 'actions/upload-artifact@v6' .github/workflows/e2e-staging.yml
grep -q 'Batch 03A' PROJECT-CONTEXT.md
git status --short
echo "Batch 03A checks completed."

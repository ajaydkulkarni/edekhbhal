#!/usr/bin/env bash
set -euo pipefail
git diff --check
npm run typecheck
npx playwright test --list
grep -q 'select\[name="entityType"\]' e2e/fine-tuning-ui.spec.ts
grep -q 'Batch 03B' PROJECT-CONTEXT.md
git status --short
echo "Batch 03B checks completed."

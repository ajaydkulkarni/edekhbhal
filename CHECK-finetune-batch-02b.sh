#!/usr/bin/env bash
set -euo pipefail
echo "== Diff whitespace =="; git diff --check
echo "== Typecheck =="; npm run typecheck
echo "== Production build =="; npm run build
echo "== Restore generated Web metadata =="; git restore next-env.d.ts tsconfig.tsbuildinfo 2>/dev/null || true
echo "== E2E discovery =="; npx playwright test --list
echo "== Mobile E2E auth sanity =="
grep -q 'ok: true, token' src/app/api/e2e/session/route.ts
grep -q 'export async function mobileLogin' e2e/helpers.ts
grep -q 'Authorization: `Bearer ${token}`' e2e/mobile-api.spec.ts
grep -q 'expect(body.state).toBe("EMPTY")' e2e/mobile-api.spec.ts
echo "== Final git status =="; git status --short
echo "All automated Fine-tuning Batch 02B checks completed successfully."

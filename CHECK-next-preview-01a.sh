#!/usr/bin/env bash
set -euo pipefail
echo "== eDekhbhal Next Preview 01A checks =="
git diff --check
echo "-- Web TypeScript --"
npx tsc --noEmit
echo "-- Mobile TypeScript --"
(cd mobile && npx tsc --noEmit)
echo "-- Required markers --"
grep -q 'const defaultApiUrl = "https://edekhbhal.vercel.app"' mobile/lib/api.ts
grep -q 'Backend: ${API_URL}' 'mobile/app/(tabs)/scan.tsx'
grep -q 'MOBILE_QR_INVALID' 'src/app/api/mobile/occurrences/[id]/scan/route.ts'
grep -q 'eDekhbhal Next Preview 01A — Mobile QR diagnostics hotfix' PROJECT-CONTEXT.md
echo "All Preview 01A static checks completed."

#!/usr/bin/env bash
set -euo pipefail

echo "== eDekhbhal Next Preview 01B checks =="

git diff --check

echo "-- Web TypeScript --"
npx tsc --noEmit

echo "-- Mobile TypeScript --"
(
  cd mobile
  npx tsc --noEmit
)

echo "-- Cleanup markers --"
if grep -q 'MOBILE_QR_INVALID' 'src/app/api/mobile/occurrences/[id]/scan/route.ts'; then
  echo "ERROR: temporary server QR diagnostic still present"
  exit 1
fi

if grep -q 'Backend: ${API_URL}' 'mobile/app/(tabs)/scan.tsx'; then
  echo "ERROR: temporary mobile QR diagnostic still present"
  exit 1
fi

grep -q 'const defaultApiUrl = "https://edekhbhal.vercel.app"' mobile/lib/api.ts
grep -q 'eDekhbhal Next Preview 01B — Mobile QR diagnostics cleanup' PROJECT-CONTEXT.md

echo "All Preview 01B static checks completed."

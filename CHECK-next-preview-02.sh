#!/usr/bin/env bash
set -euo pipefail

echo "== eDekhbhal Next Preview 02 checks =="

git diff --check

echo "-- Prisma format/generate --"
npx prisma format --schema=prisma/schema.prisma
npx prisma generate --schema=prisma/schema.prisma

echo "-- Web TypeScript --"
npx tsc --noEmit

echo "-- Production build --"
npm run build

echo "-- Playwright V2 test discovery --"
E2E_BASE_URL=https://edekhbhal.vercel.app npx playwright test --list

echo "-- Mobile TypeScript --"
(
  cd mobile
  npx tsc --noEmit
)

echo "-- Release markers --"
grep -q 'Work Area QR Code' 'src/app/schedules/[id]/page.tsx'
grep -q 'QRCode.toDataURL' 'src/app/schedules/[id]/page.tsx'
grep -q 'where: { status: "ACTIVE" }' 'src/app/schedules/[id]/page.tsx'
grep -q 'https://edekhbhal.vercel.app' playwright.config.ts
grep -q 'https://edekhbhal-staging.vercel.app' playwright.config.ts
grep -q 'isE2ETestingEnabled' src/app/api/e2e/setup/route.ts
grep -q 'isE2ETestingEnabled' src/app/api/e2e/session/route.ts
grep -q 'isE2ETestingEnabled' src/app/api/e2e/reported-work/route.ts
grep -q 'Schedule detail shows latest active Work Area QR Code' e2e/next-preview.spec.ts
grep -q 'eDekhbhal Next Preview 02 — V2 E2E regression + Schedule Work Area QR' PROJECT-CONTEXT.md

echo "All eDekhbhal Next Preview 02 static checks completed."

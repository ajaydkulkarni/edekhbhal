#!/usr/bin/env bash
set -euo pipefail
echo "== Prisma format / generate =="
npx prisma format --schema=prisma/schema.prisma
npx prisma generate --schema=prisma/schema.prisma
echo "== Diff whitespace =="
git diff --check
echo "== Typecheck =="
npm run typecheck
echo "== Production build =="
npm run build
echo "== E2E discovery =="
npx playwright test --list
echo "== Mobile TypeScript =="
(cd mobile && npx tsc --noEmit)
echo "== Markers =="
grep -q 'isAdHoc' prisma/schema.prisma
grep -q 'completedById' prisma/schema.prisma
grep -q 'OrganizationEntitlement' prisma/schema.prisma
grep -q 'Ad-hoc Task' src/components/ScheduleEditor.tsx
grep -q 'edekhbhal-product-tour.mp4' src/app/page.tsx
grep -q 'Previous service completions' 'src/app/qr/[token]/page.tsx'
grep -q 'Next Preview 01' PROJECT-CONTEXT.md
git status --short
echo "All eDekhbhal Next Preview 01 static checks completed."

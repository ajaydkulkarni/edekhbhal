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

echo "== Restore generated metadata =="
git restore next-env.d.ts tsconfig.tsbuildinfo 2>/dev/null || true

echo "== Batch 03 sanity checks =="
grep -q 'model ReportedWorkItem' prisma/schema.prisma
grep -q 'REPORTED_WORK_ITEM_SCHEDULE_LINKED' prisma/schema.prisma
grep -q 'Reported Notes / Work Requests' src/app/reports/reported-work/page.tsx
grep -q '30_000' src/components/dashboard/LiveOperationsDashboard.tsx
grep -q 'dashboardOverviewGrid' src/app/modern.css
grep -q 'propertyTeamColumns' src/components/PropertyTeamAssignments.tsx
grep -q 'Rows / Page' src/app/audit/page.tsx
grep -q 'x-vercel-forwarded-for' src/lib/audit.ts
grep -q 'Fine-tuning Batch 03' PROJECT-CONTEXT.md
test -f e2e/reported-work.spec.ts
test -f e2e/fine-tuning-ui.spec.ts

echo "== E2E test discovery =="
npx playwright test --list

echo "== Final git status =="
git status --short

echo
echo "All Fine-tuning Batch 03 static checks completed."
echo "After Vercel staging is successful, run GitHub Actions -> E2E Staging manually."

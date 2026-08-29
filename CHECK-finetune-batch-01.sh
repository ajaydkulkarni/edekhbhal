#!/usr/bin/env bash
set -euo pipefail
if [ ! -f package.json ] || [ ! -d src ]; then echo "Run from repo root."; exit 1; fi
echo "== Diff whitespace =="; git diff --check
echo "== Prisma generate =="; npm run db:generate
echo "== Web typecheck =="; npm run typecheck
echo "== Web production build =="; npm run build
echo "== Restore generated Web metadata =="; git restore next-env.d.ts tsconfig.tsbuildinfo 2>/dev/null || true
echo "== Mobile clean install / typecheck =="; cd mobile; npm ci; npm run typecheck; npx expo-doctor; cd ..
echo "== Feature sanity =="
grep -q 'model OrganizationMemberProperty' prisma/schema.prisma
grep -q 'model PersonnelDocument' prisma/schema.prisma
grep -q 'Search Results' src/app/audit/page.tsx
grep -q 'Export Excel' src/app/audit/page.tsx
grep -q 'Team Assignments' src/app/properties/\[id\]/page.tsx
grep -q 'Internal Notes' src/components/PersonnelProfileManager.tsx
grep -q 'propertyIds.length' src/app/api/mobile/queue/next/route.ts
echo "== Final git status =="; git status --short
echo "All automated Fine-tuning Batch 01 checks completed successfully."
echo "DO NOT run the Supabase migration until these checks are green."

#!/usr/bin/env bash
set -euo pipefail

if [ ! -f package.json ] || [ ! -d src ] || [ ! -d mobile ]; then
  echo "Run this script from the eDekhbhal repository root."
  exit 1
fi

echo "== Diff whitespace check =="
git diff --check

echo "== Prisma generate =="
npm run db:generate

echo "== Web typecheck =="
npm run typecheck

echo "== Web production build =="
npm run build

echo "== Restore generated Web metadata =="
git restore next-env.d.ts tsconfig.tsbuildinfo 2>/dev/null || true

echo "== Mobile clean install =="
cd mobile
npm ci

echo "== Mobile typecheck =="
npm run typecheck

echo "== Expo Doctor =="
npx expo-doctor
cd ..

echo "== Version / schema sanity =="
node -e 'const p=require("./package.json"); if(p.version!=="0.9.0") throw new Error("Root version is not 0.9.0"); if(!p.dependencies.xlsx) throw new Error("xlsx dependency missing"); console.log("Root version",p.version,"xlsx",p.dependencies.xlsx)'
grep -q 'supersedeUnstarted' prisma/schema.prisma
grep -q 'SCHEDULE_OCCURRENCE_AUTO_MISSED' prisma/schema.prisma
grep -q 'missedReason' prisma/schema.prisma

echo "== Final git status =="
git status --short

echo "All automated v0.9.0 checks completed successfully."

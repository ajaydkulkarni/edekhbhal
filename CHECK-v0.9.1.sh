#!/usr/bin/env bash
set -euo pipefail

if [ ! -f package.json ] || [ ! -d src ]; then
  echo "Run this script from the eDekhbhal repository root."
  exit 1
fi

echo "== Diff whitespace =="
git diff --check

echo "== Prisma generate =="
npm run db:generate

echo "== Web typecheck =="
npm run typecheck

echo "== Web production build =="
npm run build

echo "== Restore generated metadata =="
git restore next-env.d.ts tsconfig.tsbuildinfo 2>/dev/null || true

echo "== Version sanity =="
node -e 'const p=require("./package.json"); if(p.version!=="0.9.1") throw new Error("Root version is not 0.9.1"); console.log("Root version",p.version)'

grep -q 'View / Reprint QR' src/components/WorkAreaRowActions.tsx
grep -q 'Regenerate QR' src/components/WorkAreaRowActions.tsx
grep -q 'renderQrDataUrl' src/app/work-areas/\[id\]/service-status/page.tsx

echo "== Final git status =="
git status --short

echo "All automated v0.9.1 checks completed successfully."

#!/usr/bin/env bash
set -euo pipefail
echo "== Diff whitespace =="; git diff --check
echo "== Prisma generate =="; npm run db:generate
echo "== Web typecheck =="; npm run typecheck
echo "== Web production build =="; npm run build
echo "== Restore generated Web metadata =="; git restore next-env.d.ts tsconfig.tsbuildinfo 2>/dev/null || true
echo "== Hotfix sanity =="
grep -q 'if(am.role==="PROPERTY_MANAGER"&&!isSelf)' 'src/app/team/[id]/page.tsx'
grep -q 'showNotes={am.role!=="USER"&&!isSelf}' 'src/app/team/[id]/page.tsx'
echo "== Final git status =="; git status --short
echo "All automated Fine-tuning Batch 01A checks completed successfully."

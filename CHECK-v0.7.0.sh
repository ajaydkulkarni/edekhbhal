#!/usr/bin/env bash
set -euo pipefail

echo "== Web typecheck =="
npm run typecheck

echo "== Web production build =="
npm run build

echo "== Restore generated Web build metadata =="
git restore next-env.d.ts tsconfig.tsbuildinfo 2>/dev/null || true

echo "== Mobile clean install =="
(
  cd mobile
  npm ci
  echo "== Mobile typecheck =="
  npm run typecheck
  echo "== Expo Doctor =="
  npx expo-doctor
)

echo "== Final git status =="
git status --short

echo "All automated build/type checks completed successfully."

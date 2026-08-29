#!/usr/bin/env bash
set -euo pipefail

if [ ! -f package.json ] || [ ! -d src ] || [ ! -d mobile ]; then
  echo "Run this script from the eDekhbhal repository root."
  exit 1
fi

echo "== Diff whitespace check =="
git diff --check

echo "== Web typecheck =="
npm run typecheck

echo "== Mobile clean install =="
cd mobile
npm ci

echo "== Mobile typecheck =="
npm run typecheck

echo "== Expo Doctor =="
npx expo-doctor
cd ..

echo "== Final git status =="
git status --short

echo "All automated v0.8.1 hotfix checks completed successfully."

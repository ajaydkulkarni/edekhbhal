#!/usr/bin/env bash
set -euo pipefail

export E2E_BASE_URL="https://edekhbhal.vercel.app"

: "${E2E_TEST_SECRET:?Set E2E_TEST_SECRET in this shell without sharing it}"
: "${E2E_ADMIN_EMAIL:?Set E2E_ADMIN_EMAIL}"
: "${E2E_PM_EMAIL:?Set E2E_PM_EMAIL}"
: "${E2E_USER_EMAIL:?Set E2E_USER_EMAIL}"
: "${E2E_UNASSIGNED_EMAIL:?Set E2E_UNASSIGNED_EMAIL}"

npx playwright test

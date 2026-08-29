#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
PACKAGE_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ ! -f "$ROOT/package.json" ] || [ ! -d "$ROOT/src" ]; then
  echo "Run this script from the eDekhbhal repository root."
  exit 1
fi

mkdir -p "$ROOT/.github/workflows"
cp "$PACKAGE_DIR/workflow-payload/e2e-staging.yml" "$ROOT/.github/workflows/e2e-staging.yml"

python3 - <<'PY'
from pathlib import Path

p = Path("PROJECT-CONTEXT.md")
text = p.read_text()

section = '''
### Fine-tuning Batch 02C — GitHub Actions E2E Baseline
- Live staging Playwright baseline is green: 9/9 tests passed.
- Covered baseline scenarios: Audit Trail access/export, unassigned USER mobile queue returns no executable work, Admin sees both E2E Properties, PM sees only assigned Property A, PM cannot update Property master through API, PM cannot access unassigned Property B detail, USER cannot open another Team Member profile, Admin key-screen smoke coverage, and PM full self-service profile access.
- Added manual GitHub Actions workflow `.github/workflows/e2e-staging.yml`.
- Workflow uses Node 20, `npm ci`, Chromium with Linux dependencies, repository Actions secrets for E2E credentials, and uploads the Playwright report artifact.
- Keep GitHub Actions workflow manual (`workflow_dispatch`) until the expanded authorization suite is stable; automatic post-deploy execution is a later step.
- RLS remains deferred until broader server-side authorization/API regression coverage is implemented and green.
'''
if "### Fine-tuning Batch 02C — GitHub Actions E2E Baseline" not in text:
    text += "\n\n" + section

p.write_text(text)
PY

echo "Fine-tuning Batch 02C applied."
echo "Next: bash CHECK-finetune-batch-02c.sh"

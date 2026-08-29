#!/usr/bin/env bash
set -euo pipefail
ROOT="$(pwd)"
PACKAGE_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ ! -f "$ROOT/package.json" ] || [ ! -d "$ROOT/src" ]; then
  echo "Run this script from the eDekhbhal repository root."; exit 1
fi
cp -a "$PACKAGE_DIR/batch-files/." "$ROOT/"

python3 - <<'PY'
from pathlib import Path
import json, re
p=Path("package.json")
data=json.loads(p.read_text())
data.setdefault("scripts", {})["test:e2e:install"]="playwright install --with-deps chromium"
p.write_text(json.dumps(data, indent=2)+"\n")

c=Path("PROJECT-CONTEXT.md")
text=c.read_text()
text=re.sub(
    r"\*\*Current deployment status:\*\*.*",
    "**Current deployment status:** v0.9.1 remains the application version. Fine-tuning Batch 02A corrects E2E runtime enablement for the dedicated staging Vercel project and installs Chromium system dependencies for Codespaces. E2E endpoints are gated by E2E_TESTING_ENABLED, the staging APP_URL, the E2E secret and explicit test emails. RLS remains deferred until role/security E2E regression is green.",
    text,count=1
)
section = """
### Fine-tuning Batch 02A — E2E Runtime Hotfix
- Dedicated staging Vercel projects can report VERCEL_ENV=production for their production branch even though the application itself is staging.
- E2E enablement now binds to APP_URL=https://edekhbhal-staging.vercel.app plus E2E_TESTING_ENABLED=true instead of rejecting VERCEL_ENV=production.
- Secret and explicit-email allow-list checks remain mandatory.
- Codespaces Playwright install command now includes Linux system dependencies via `playwright install --with-deps chromium`.
"""
if "### Fine-tuning Batch 02A — E2E Runtime Hotfix" not in text:
    text += "\n\n" + section
c.write_text(text)
PY

echo "Fine-tuning Batch 02A applied."
echo "Next: bash CHECK-finetune-batch-02a.sh"

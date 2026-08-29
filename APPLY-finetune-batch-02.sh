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
scripts=data.setdefault("scripts", {})
scripts["test:e2e"]="playwright test"
scripts["test:e2e:headed"]="playwright test --headed"
scripts["test:e2e:report"]="playwright show-report"
scripts["test:e2e:install"]="playwright install chromium"
data.setdefault("devDependencies", {})["@playwright/test"]="^1.55.0"
p.write_text(json.dumps(data, indent=2)+"\n")

g=Path(".gitignore")
text=g.read_text()
for item in ["playwright-report", "test-results", ".playwright"]:
    if item not in text.splitlines():
        text += item + "\n"
g.write_text(text)

c=Path("PROJECT-CONTEXT.md")
text=c.read_text()
text=re.sub(r"\*\*Last updated:\*\*.*","**Last updated:** 2026-08-29",text,count=1)
text=re.sub(
    r"\*\*Current deployment status:\*\*.*",
    "**Current deployment status:** v0.9.1 remains the application version. Fine-tuning Batch 02 adds Playwright staging E2E automation, deterministic test identities/fixtures, role/property access tests and a manual GitHub Actions E2E workflow. RLS remains deferred until application/API scope enforcement and E2E role regression are green.",
    text,count=1
)
text=re.sub(
    r"\*\*Current GitHub deployment commit observed in successful Vercel build:\*\* `[^`]+`",
    "**Current GitHub deployment commit observed in successful Vercel build:** `9c24f7a`",
    text,count=1
)
section = """
### Fine-tuning Batch 02 — Automated Functional Testing Foundation
- Playwright is the Web/API E2E framework.
- Tests target staging, never production.
- Staging-only E2E auth requires E2E_TESTING_ENABLED=true, non-production Vercel environment, E2E_TEST_SECRET, and explicit allowed E2E emails.
- E2E setup creates/reuses deterministic Property A/B plus PM, assigned User and unassigned User fixtures in the Organization belonging to E2E_ADMIN_EMAIL.
- Initial automated coverage: key-screen smoke, Audit export smoke, PM self-profile regression, property visibility/API authorization and unassigned mobile queue.
- GitHub Actions workflow is manual initially; automatic post-deploy execution can be enabled after stability is proven.
- Native Android camera/QR/evidence UI remains manual for now; mobile backend/API behavior is automatable.
"""
if "### Fine-tuning Batch 02 — Automated Functional Testing Foundation" not in text:
    text += "\n\n" + section
c.write_text(text)
PY

echo "Installing root dependencies including Playwright test package..."
npm install
echo "Fine-tuning Batch 02 applied."
echo "Next: bash CHECK-finetune-batch-02.sh"

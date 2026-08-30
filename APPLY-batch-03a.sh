#!/usr/bin/env bash
set -euo pipefail
if [ ! -f package.json ] || [ ! -d e2e ]; then
  echo "Run from the eDekhbhal repository root."
  exit 1
fi
cp e2e-payload/fine-tuning-ui.spec.ts e2e/fine-tuning-ui.spec.ts
cp e2e-payload/reported-work.spec.ts e2e/reported-work.spec.ts
mkdir -p .github/workflows
cp workflow-payload/e2e-staging.yml .github/workflows/e2e-staging.yml

python3 - <<'PY'
from pathlib import Path
p=Path("PROJECT-CONTEXT.md")
t=p.read_text()
s="""
### Batch 03A — E2E locator / Node 24 workflow hotfix
- First 22-test Batch 03 staging run: 18 passed, 4 failed only because Playwright strict locators matched both form options/labels and the intended table/heading elements.
- No application behavior failure was identified in those four failures.
- E2E locators were narrowed with exact labels/headings and report-row scoping.
- GitHub Actions E2E runtime updated to Node 24 and official Node-24-compatible actions (`checkout@v6`, `setup-node@v6`, `upload-artifact@v6`), removing the Node 20/Supabase engine mismatch.
- Re-run the complete 22-test staging suite after deployment.
"""
if "### Batch 03A — E2E locator / Node 24 workflow hotfix" not in t:
    p.write_text(t+"\n\n"+s)
PY
echo "Batch 03A applied."

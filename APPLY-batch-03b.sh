#!/usr/bin/env bash
set -euo pipefail
cp e2e-payload/fine-tuning-ui.spec.ts e2e/fine-tuning-ui.spec.ts
python3 - <<'PY'
from pathlib import Path
p=Path("PROJECT-CONTEXT.md")
t=p.read_text()
s="""
### Batch 03B — Final Audit E2E locator hotfix
- E2E Staging #3 reached 21/22 passing.
- The sole failure was the Audit test locator for `Entity Type`: the HTML label's accessible name includes its option text, so Playwright `getByLabel(..., exact:true)` could not find it.
- Test now targets the stable form controls directly by `select[name=entityType]`, `select[name=entityId]`, and `select[name=pageSize]`.
- No application or database behavior changed.
"""
if "### Batch 03B — Final Audit E2E locator hotfix" not in t:
    p.write_text(t+"\n\n"+s)
PY
echo "Batch 03B applied."

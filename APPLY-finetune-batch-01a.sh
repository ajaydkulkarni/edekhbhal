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
import re
p=Path("PROJECT-CONTEXT.md")
text=p.read_text()
text=re.sub(r"\*\*Last updated:\*\*.*","**Last updated:** 2026-08-29",text,count=1)
text=re.sub(
    r"\*\*Current deployment status:\*\*.*",
    "**Current deployment status:** v0.9.1 remains deployed in staging. Fine-tuning Batch 01 is under functional validation. Batch 01A hotfix fixes Property Manager self-service profile access while preserving assigned-property restrictions for viewing other personnel. RLS remains deferred until application-level property scoping passes role regression.",
    text,count=1
)
text=re.sub(
    r"\*\*Current GitHub deployment commit observed in successful Vercel build:\*\* `[^`]+`",
    "**Current GitHub deployment commit observed in successful Vercel build:** `2c05ae2`",
    text,count=1
)
section = """
### Fine-tuning Batch 01A — Property Manager Self-Service Profile Hotfix
- Fixes a 404 when a Property Manager opens My Profile → View Full Self-Service Profile.
- Property Manager self-access is allowed.
- Property Manager access to other personnel remains limited to USER records within assigned Property scope.
- Internal management Notes remain hidden on self-service access.
"""
if "### Fine-tuning Batch 01A — Property Manager Self-Service Profile Hotfix" not in text:
    text += "\n\n" + section
p.write_text(text)
PY

echo "Fine-tuning Batch 01A applied."
echo "Next: bash CHECK-finetune-batch-01a.sh"

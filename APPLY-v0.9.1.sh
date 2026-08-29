#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
PACKAGE_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ ! -f "$ROOT/package.json" ] || [ ! -d "$ROOT/src" ]; then
  echo "Run this script from the eDekhbhal repository root."
  exit 1
fi

if [ ! -d "$PACKAGE_DIR/v0.9.1-files" ]; then
  echo "v0.9.1-files payload folder not found next to APPLY-v0.9.1.sh"
  exit 1
fi

cp -a "$PACKAGE_DIR/v0.9.1-files/." "$ROOT/"

python3 - <<'PY'
from pathlib import Path
import json, re

p = Path("package.json")
data = json.loads(p.read_text())
data["version"] = "0.9.1"
p.write_text(json.dumps(data, indent=2) + "\n")

p = Path("PROJECT-CONTEXT.md")
text = p.read_text()

text = re.sub(
    r"\*\*Current application version:\*\*.*",
    "**Current application version:** v0.9.1 (Direct Work Area QR Visibility Hotfix)",
    text,
    count=1
)

text = re.sub(
    r"\*\*Current deployment status:\*\*.*",
    "**Current deployment status:** v0.9.0 Web/API deployed successfully and initial Compliance / Work Area Service Status / public QR checks passed; v0.9.1 direct Work Area QR visibility hotfix prepared for validation",
    text,
    count=1
)

section = r"""

---

## v0.9.1 — Direct Work Area QR Visibility Hotfix

Field validation of v0.9.0 confirmed Reports → Service Compliance, Work Areas → Service Status and the public QR status page were working correctly.

A Web UX gap remained: when entering **Work Areas** directly, QR display/printing was still available only through the Property detail Work Area manager.

v0.9.1 closes that gap without changing the QR data model or security behavior.

### Direct Work Areas QR controls

The standalone Work Areas table now provides the same active-QR management flow already available under Property detail:

- **View / Reprint QR**
- **Regenerate QR**
- QR modal with the actual QR image
- QR ID
- Parent Property
- **Print QR**

Regenerate continues to use the existing audited QR regeneration endpoint and invalidates the prior QR exactly as before.

### Work Area Service Status QR visibility

The management Service Status page now renders the actual active Work Area QR image, not only a link to the public status page.

The displayed QR remains the same QR identity used for:

1. authenticated eDekhbhal mobile execution validation; and
2. normal phone-camera access to the public Work Area service-status page.

### Database / mobile impact

- No database migration.
- No mobile binary change.
- Existing v0.8.1 Android APK remains valid.
"""

if "## v0.9.1 — Direct Work Area QR Visibility Hotfix" not in text:
    text += section

p.write_text(text)
PY

echo "v0.9.1 applied."
echo "Next: bash CHECK-v0.9.1.sh"

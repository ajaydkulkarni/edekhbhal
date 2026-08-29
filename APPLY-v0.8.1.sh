#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
PACKAGE_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ ! -f "$ROOT/package.json" ] || [ ! -d "$ROOT/src" ] || [ ! -d "$ROOT/mobile" ]; then
  echo "Run this script from the eDekhbhal repository root."
  exit 1
fi

cp -a "$PACKAGE_DIR/v0.8.1-files/." "$ROOT/"

python3 - <<'PY'
from pathlib import Path
import json

# Release metadata.
p = Path('package.json')
data = json.loads(p.read_text())
data['version'] = '0.8.1'
p.write_text(json.dumps(data, indent=2) + '\n')

p = Path('mobile/package.json')
data = json.loads(p.read_text())
data['version'] = '0.8.1'
p.write_text(json.dumps(data, indent=2) + '\n')

p = Path('mobile/app.json')
data = json.loads(p.read_text())
expo = data['expo']
expo['version'] = '0.8.1'
expo.setdefault('android', {})['versionCode'] = max(int(expo.get('android', {}).get('versionCode', 1)), 3)
p.write_text(json.dumps(data, indent=2) + '\n')

# Canonical continuity context.
p = Path('PROJECT-CONTEXT.md')
text = p.read_text()
text = text.replace(
    '**Current application version:** v0.8.0 (Mobile UX, Localization & Personal Reporting)',
    '**Current application version:** v0.8.1 (Mobile Navigation Visibility Hotfix)',
    1
)
status_prefix = '**Current deployment status:**'
lines = text.splitlines()
for i, line in enumerate(lines):
    if line.startswith(status_prefix):
        lines[i] = '**Current deployment status:** v0.8.0 Web/API and database migration are deployed to staging; v0.8.1 mobile navigation visibility hotfix is being validated before replacement Android APK build'
        break
text = '\n'.join(lines) + ('\n' if p.read_text().endswith('\n') else '')
marker = '## v0.8.1 — Mobile Navigation Visibility Hotfix'
if marker not in text:
    text += '''\n\n---\n\n## v0.8.1 — Mobile Navigation Visibility Hotfix\n\nField testing of the v0.8.0 Android APK on a Samsung device showed that the bottom navigation tab content was rendered too close to / into the Android system navigation area. My Work remained usable, but Scan, Report and Profile labels/icons were effectively invisible, which also made Profile-only features such as preferred language, password management and Sign Out appear missing.\n\nThe v0.8.1 mobile-only hotfix:\n\n- uses `react-native-safe-area-context` bottom insets for the tab bar;\n- raises the tab content above Android system navigation;\n- explicitly sets active and inactive tab colors;\n- explicitly applies the navigator-provided tint color to custom tab icons;\n- increases label contrast and weight;\n- adds a subtle active-tab background;\n- preserves the existing four tabs: My Work, Scan, Report and Profile;\n- bumps Android `versionCode` to 3 so the corrected APK installs as an update.\n\nNo database migration or Web/API change is required for this hotfix.\n'''
p.write_text(text)
PY

echo "v0.8.1 mobile navigation hotfix applied."
echo "Next: run bash CHECK-v0.8.1.sh"

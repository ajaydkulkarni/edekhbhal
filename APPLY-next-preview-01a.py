#!/usr/bin/env python3
from pathlib import Path
import shutil
ROOT=Path(__file__).resolve().parent
PAYLOAD=ROOT/'payload'
FILES=[
'mobile/lib/api.ts',
'mobile/app/(tabs)/scan.tsx',
'src/app/api/mobile/occurrences/[id]/scan/route.ts',
]
for rel in FILES:
    src=PAYLOAD/rel; dst=ROOT/rel
    if not src.exists(): raise SystemExit(f"Missing payload file: {src}")
    dst.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(src,dst); print(f"Updated {rel}")
context=ROOT/'PROJECT-CONTEXT.md'
marker='## eDekhbhal Next Preview 01A — Mobile QR diagnostics hotfix'
append_text='## eDekhbhal Next Preview 01A — Mobile QR diagnostics hotfix (2026-08-30)\n\n- Branch: `v2-rebuild`.\n- V2 web URL: `https://edekhbhal.vercel.app`.\n- Mobile preview API configuration is normalized so the hard-coded fallback in `mobile/lib/api.ts` also points to the V2 web URL.\n- Mobile QR validation diagnostics are temporarily improved for staging: an `INVALID_QR` alert shows the backend URL and a bounded preview of the scanned QR payload; the server writes a `MOBILE_QR_INVALID` warning containing only non-secret diagnostic fields.\n- No database schema change is required.\n- Existing QR records must not be regenerated merely for this diagnostic hotfix.\n- Remove/reduce these staging diagnostics after the QR mismatch is resolved.\n'
if not context.exists(): raise SystemExit('PROJECT-CONTEXT.md not found at repository root')
text=context.read_text()
if marker not in text:
    context.write_text(text.rstrip()+'\n\n'+append_text.rstrip()+'\n'); print('Updated PROJECT-CONTEXT.md')
else: print('PROJECT-CONTEXT.md already contains Preview 01A note')
print('Preview 01A applied.')

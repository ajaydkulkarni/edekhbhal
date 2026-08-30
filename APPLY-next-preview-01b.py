#!/usr/bin/env python3
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parent
PAYLOAD = ROOT / "payload"

FILES = [
    "mobile/app/(tabs)/scan.tsx",
    "src/app/api/mobile/occurrences/[id]/scan/route.ts",
]

for rel in FILES:
    src = PAYLOAD / rel
    dst = ROOT / rel
    if not src.exists():
        raise SystemExit(f"Missing payload file: {src}")
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    print(f"Updated {rel}")

context = ROOT / "PROJECT-CONTEXT.md"
marker = "## eDekhbhal Next Preview 01B — Mobile QR diagnostics cleanup"
append_text = '## eDekhbhal Next Preview 01B — Mobile QR diagnostics cleanup (2026-08-30)\n\n- Branch: `v2-rebuild`.\n- V2 mobile smoke testing passed for login, My Work, Work Area QR scan, task execution, evidence capture, occurrence completion, Report, Profile, and public QR verification.\n- Root cause of the mobile QR validation failure was a malformed Vercel `APP_URL` environment variable value that included the literal `APP_URL=` prefix.\n- Correct V2 `APP_URL` value is exactly `https://edekhbhal.vercel.app`.\n- Preview 01A temporary QR diagnostics are removed from the mobile user-facing alert and server warning logs.\n- The corrected mobile fallback API URL in `mobile/lib/api.ts` remains `https://edekhbhal.vercel.app`.\n- No database schema change is required.\n- Next planned work: live V2 E2E regression setup with an explicit allowed-domain guard for the parallel V2 domain and Preview 01-specific coverage.\n'
if not context.exists():
    raise SystemExit("PROJECT-CONTEXT.md not found at repository root")
text = context.read_text()
if marker not in text:
    context.write_text(text.rstrip() + "\n\n" + append_text.rstrip() + "\n")
    print("Updated PROJECT-CONTEXT.md")
else:
    print("PROJECT-CONTEXT.md already contains Preview 01B note")

print("Preview 01B applied.")

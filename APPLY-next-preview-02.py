#!/usr/bin/env python3
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parent
PAYLOAD = ROOT / "payload"

FILES = [
    "src/app/schedules/[id]/page.tsx",
    "src/lib/e2e-testing.ts",
    "playwright.config.ts",
    "e2e/helpers.ts",
    "src/app/api/e2e/setup/route.ts",
    "src/app/api/e2e/session/route.ts",
    "e2e/next-preview.spec.ts",
]

for rel in FILES:
    src = PAYLOAD / rel
    dst = ROOT / rel
    if not src.exists():
        raise SystemExit(f"Missing payload file: {src}")
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    print(f"Updated {rel}")

# Preserve the existing reported-work fixture implementation; only centralize its E2E URL guard.
reported = ROOT / "src/app/api/e2e/reported-work/route.ts"
if not reported.exists():
    raise SystemExit("Missing src/app/api/e2e/reported-work/route.ts")
text = reported.read_text()
if 'from "@/lib/e2e-testing"' not in text:
    text = text.replace(
        'import {prisma} from "@/lib/prisma";\n',
        'import {prisma} from "@/lib/prisma";\nimport {isE2ETestingEnabled} from "@/lib/e2e-testing";\n'
    )
text = text.replace(
    'const STAGING_APP_URL="https://edekhbhal-staging.vercel.app";\nfunction enabled(){return process.env.E2E_TESTING_ENABLED==="true"&&(process.env.APP_URL||"").replace(/\\/$/,"")===STAGING_APP_URL;}\n',
    ''
)
text = text.replace('if(!enabled())return NextResponse.json({error:"Not found."},{status:404});',
                    'if(!isE2ETestingEnabled())return NextResponse.json({error:"Not found."},{status:404});')
reported.write_text(text)
print("Updated src/app/api/e2e/reported-work/route.ts E2E guard")

context = ROOT / "PROJECT-CONTEXT.md"
marker = "## eDekhbhal Next Preview 02 — V2 E2E regression + Schedule Work Area QR"
note = '## eDekhbhal Next Preview 02 — V2 E2E regression + Schedule Work Area QR (2026-08-30)\n\n- Branch: `v2-rebuild`.\n- One combined release replaces the earlier standalone Preview 01C QR convenience patch.\n- Schedule detail displays the latest ACTIVE QR Code for its Work Area, including generation time and a functional public QR link.\n- The QR payload points to `${APP_URL}/qr/{qrCodeId}` and therefore opens the existing public Work Area QR experience.\n- If no active QR exists, the Schedule screen displays a clear empty state; no fabricated QR is generated.\n- E2E support is expanded to the V2 parallel deployment at `https://edekhbhal.vercel.app`.\n- E2E server endpoints remain protected by both `E2E_TESTING_ENABLED=true`, the secret header, and an explicit exact APP_URL allow-list. The original staging URL remains permitted for controlled regression runs.\n- Playwright defaults to the V2 URL and refuses unapproved targets.\n- Existing regression tests remain in place. Three V2-specific tests are added for public landing entry points, latest Schedule Work Area QR rendering/linkage, and public QR privacy.\n- `/api/e2e/setup` now creates deterministic V2 Schedule/Work Area/QR fixtures while retaining its existing account/property fixtures.\n- No database schema change is required.\n- Before live V2 E2E, the V2 Vercel project must contain the existing E2E environment variables and be redeployed after enabling them.\n'
if not context.exists():
    raise SystemExit("PROJECT-CONTEXT.md not found at repository root")
ctx = context.read_text()
if marker not in ctx:
    context.write_text(ctx.rstrip() + "\n\n" + note.rstrip() + "\n")
    print("Updated PROJECT-CONTEXT.md")
else:
    print("PROJECT-CONTEXT.md already contains Preview 02 note")

print("Preview 02 applied.")

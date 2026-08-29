#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
PACKAGE_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ ! -f "$ROOT/package.json" ] || [ ! -d "$ROOT/src" ] || [ ! -d "$ROOT/mobile" ]; then
  echo "Run this script from the eDekhbhal repository root."
  exit 1
fi

if [ ! -d "$PACKAGE_DIR/v0.9.0-files" ]; then
  echo "v0.9.0-files payload folder not found next to APPLY-v0.9.0.sh"
  exit 1
fi

cp -a "$PACKAGE_DIR/v0.9.0-files/." "$ROOT/"

python3 - <<'PY'
from pathlib import Path
import json

# ---------- root package metadata ----------
p = Path("package.json")
data = json.loads(p.read_text())
data["version"] = "0.9.0"
deps = data.setdefault("dependencies", {})
deps["xlsx"] = "^0.18.5"
p.write_text(json.dumps(data, indent=2) + "\n")

# ---------- canonical Prisma schema ----------
p = Path("prisma/schema.prisma")
text = p.read_text()

action_anchor = """  SCHEDULE_OCCURRENCES_RECONCILED
  SCHEDULE_CLAIMED"""
if "SCHEDULE_OCCURRENCE_AUTO_MISSED" not in text:
    if action_anchor not in text:
        raise SystemExit("Prisma ActionType anchor not found.")
    text = text.replace(
        action_anchor,
        """  SCHEDULE_OCCURRENCES_RECONCILED
  SCHEDULE_OCCURRENCE_AUTO_MISSED
  SCHEDULE_CLAIMED""",
        1
    )

schedule_anchor = """  occurrenceGeneratedThrough DateTime?
  timezone"""
if "supersedeUnstarted" not in text:
    if schedule_anchor not in text:
        raise SystemExit("Prisma Schedule anchor not found.")
    text = text.replace(
        schedule_anchor,
        """  occurrenceGeneratedThrough DateTime?
  supersedeUnstarted Boolean               @default(true)
  timezone""",
        1
    )

occ_anchor = """  actualDurationSeconds  Int?
  createdAt"""
if "autoMissedAt" not in text:
    if occ_anchor not in text:
        raise SystemExit("Prisma ScheduleOccurrence anchor not found.")
    text = text.replace(
        occ_anchor,
        """  actualDurationSeconds  Int?
  autoMissedAt           DateTime?
  missedReason           String?                  @db.Text
  createdAt""",
        1
    )

index_anchor = """  @@index([organizationId, claimExpiresAt, status])
}"""
new_index = """  @@index([organizationId, claimExpiresAt, status])
  @@index([scheduleId, scheduledStartAt, status])
}"""
if "@@index([scheduleId, scheduledStartAt, status])" not in text:
    if index_anchor not in text:
        raise SystemExit("Prisma occurrence index anchor not found.")
    text = text.replace(index_anchor, new_index, 1)

p.write_text(text)

# ---------- Service Log export buttons ----------
p = Path("src/app/reports/service-log/page.tsx")
text = p.read_text()

query_anchor = """  const dateTo = validDate(first(query.dateTo));

  const dateFilter"""
if "const exportParams = new URLSearchParams();" not in text:
    if query_anchor not in text:
        raise SystemExit("Service Log query anchor not found.")
    export_code = """  const dateTo = validDate(first(query.dateTo));

  const exportParams = new URLSearchParams();
  if (dateFrom) exportParams.set("dateFrom", dateFrom);
  if (dateTo) exportParams.set("dateTo", dateTo);
  if (propertyId) exportParams.set("propertyId", propertyId);
  if (workAreaId) exportParams.set("workAreaId", workAreaId);
  if (scheduleId) exportParams.set("scheduleId", scheduleId);
  if (userId) exportParams.set("userId", userId);

  const dateFilter"""
    text = text.replace(query_anchor, export_code, 1)

button_anchor = """            <Link className="button secondary" href="/reports/service-log">Clear</Link>
          </div>"""
if "Export CSV" not in text:
    if button_anchor not in text:
        raise SystemExit("Service Log button anchor not found.")
    buttons = """            <Link className="button secondary" href="/reports/service-log">Clear</Link>
            <a
              className="button secondary"
              href={`/api/reports/service-log/export?${exportParams.toString()}&format=csv`}
            >
              Export CSV
            </a>
            <a
              className="button secondary"
              href={`/api/reports/service-log/export?${exportParams.toString()}&format=xlsx`}
            >
              Export XLSX
            </a>
          </div>"""
    text = text.replace(button_anchor, buttons, 1)

p.write_text(text)

# ---------- Canonical continuity context ----------
p = Path("PROJECT-CONTEXT.md")
text = p.read_text()

import re
text = re.sub(
    r"\*\*Current application version:\*\*.*",
    "**Current application version:** v0.9.0 (Smart Service Compliance & Public Work Area QR)",
    text,
    count=1
)
text = re.sub(
    r"\*\*Current deployment status:\*\*.*",
    "**Current deployment status:** v0.8.1 Android APK field-tested successfully; v0.9.0 Web/API package prepared for validation and staging migration/deployment",
    text,
    count=1
)

apk_note = """
**Current Android field build:** v0.8.1, versionCode 3, EAS build `55db02b1-76dd-4e86-9f73-db97be2a17c7`, source commit `ad4ea3bf21658583c07843d6569b09e174459316`.
"""
if "**Current Android field build:**" not in text:
    marker = "**Current GitHub deployment commit observed in successful Vercel build:**"
    idx = text.find(marker)
    if idx >= 0:
        end = text.find("\n", idx)
        text = text[:end+1] + apk_note + text[end+1:]

section = r"""

---

## v0.9.0 — Smart Service Compliance & Public Work Area QR

This release consolidates the next Web/API operational roadmap around service compliance.

### Smart recurring-schedule supersession

Recurring operational schedules use a **latest due occurrence wins** rule when `Schedule.supersedeUnstarted = true` (default).

- Future pre-generated occurrences do not supersede anything until their own `scheduledStartAt`.
- When a later occurrence of the same recurring Schedule becomes due, older unstarted `PENDING` occurrences are automatically changed to `MISSED`.
- A claimed-but-unstarted occurrence is still `PENDING`; it is released and marked `MISSED` when superseded.
- `IN_PROGRESS`, `COMPLETED`, `PARTIALLY_COMPLETED`, `MISSED` and `CANCELED` history is never rewritten.
- PENDING occurrence Tasks are marked `MISSED` at the same time.
- The reason is stored in `ScheduleOccurrence.missedReason`.
- `autoMissedAt` records when the rule was applied.
- Audit action: `SCHEDULE_OCCURRENCE_AUTO_MISSED`.
- Reconciliation runs in the occurrence cron and immediately before the mobile next-work queue is resolved.

This prevents repetitive operational work from accumulating as a catch-up backlog while preserving accountability in management reporting.

### Public Work Area QR status

The existing printed Work Area QR remains the single QR identity.

A normal phone camera can scan it without installing or opening the eDekhbhal mobile application. The public `/qr/[token]` page shows only safe operational status:

- Work Area and Property;
- last completed/partially completed service;
- last service date/time and duration;
- relative last-serviced age;
- next scheduled service;
- recent completed/partial/missed service history.

The public page deliberately does **not** expose worker identity, email addresses, internal notes, evidence, audit information or tenant administration data.

The authenticated eDekhbhal mobile app continues to use the same QR identity for execution validation. Regenerating/revoking a QR makes the previous public QR invalid because the public route requires an ACTIVE `QrCode` record.

### Work Area Web service status

Admin/Property Manager Work Areas now provide a Service Status page with:

- current active public QR link;
- last service;
- next scheduled service;
- recent history;
- direct management occurrence drill-down.

### Service Compliance & Analytics

New `/reports/compliance` reporting provides:

- Completed / Partially Completed / Missed KPIs;
- service-compliance percentage;
- filters by date, Property, Work Area, Schedule, User and final status;
- summaries by Schedule;
- summaries by Property;
- summaries by Work Area;
- summaries by User;
- occurrence-level drill-down.

### Occurrence management drill-down

`/reports/occurrences/[id]` is restricted to active ADMIN / PROPERTY_MANAGER memberships and is organization-scoped. It shows:

- occurrence snapshot/context;
- schedule and Task timing/status;
- actual durations;
- auto-miss reason;
- Schedule and Task notes;
- authorized evidence previews through short-lived signed URLs.

### Service Log exports

The existing Service Log retains its filters and gains:

- CSV export;
- XLSX export;
- export limit up to 5,000 matching completed Task performances.

The XLSX endpoint uses the server-side `xlsx` package. Export endpoints are session-authenticated, management-role-gated and Organization-scoped.

### Database additions

- `Schedule.supersedeUnstarted Boolean @default(true)`
- `ScheduleOccurrence.autoMissedAt DateTime?`
- `ScheduleOccurrence.missedReason String?`
- `ActionType.SCHEDULE_OCCURRENCE_AUTO_MISSED`
- supporting occurrence index

Migration: `supabase-v0.9.0-smart-compliance.sql`.

### Mobile binary impact

No new Android binary is required for v0.9.0. The installed v0.8.1 app receives the smarter queue behavior through the server API. Public QR status is browser-based and works from a normal phone camera.

### v0.9.0 staging gate

1. Apply package.
2. Install root dependencies without forcing audit upgrades.
3. Generate Prisma client.
4. Web typecheck.
5. Web production build.
6. Mobile typecheck.
7. Expo Doctor.
8. Apply `supabase-v0.9.0-smart-compliance.sql` in staging.
9. Redeploy/verify Vercel.
10. Functional regression using `TESTING-v0.9.0.md`.
"""

if "## v0.9.0 — Smart Service Compliance & Public Work Area QR" not in text:
    text += section

p.write_text(text)
PY

echo "Installing v0.9.0 Web dependency (no force audit changes)..."
npm install --package-lock=false --no-audit --no-fund

echo "v0.9.0 package applied."
echo "Next: run bash CHECK-v0.9.0.sh"

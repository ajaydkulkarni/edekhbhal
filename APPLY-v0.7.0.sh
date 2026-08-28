#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
PACKAGE_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ ! -f "$ROOT/package.json" ] || [ ! -d "$ROOT/src" ]; then
  echo "Run this script from the eDekhbhal repository root."
  exit 1
fi

cp -a "$PACKAGE_DIR/files/." "$ROOT/"

python3 - <<'PY'
from pathlib import Path
p=Path('PROJECT-CONTEXT.md')
text=p.read_text()
text=text.replace('**Last updated:** 2026-08-27','**Last updated:** 2026-08-28',1)
text=text.replace('**Current application version:** v0.6.1 (Reports Foundation)','**Current application version:** v0.7.0 (Supervisor Dashboard & Web UX Modernization)',1)
old='**Current deployment status:** v0.6.0 Web/backend staging is operational; the first Android Expo EAS preview APK is built and field-tested successfully; v0.6.1 Reports Foundation is the next Web increment'
new='**Current deployment status:** v0.6.1 Reports is deployed; v0.7.0 Supervisor Dashboard / modern Web shell is prepared for migration, build validation and staging deployment'
text=text.replace(old,new,1)
marker='## v0.7.0 — Supervisor Dashboard & Web UX Modernization'
if marker not in text:
    text += '''\n\n---\n\n## v0.7.0 — Supervisor Dashboard & Web UX Modernization\n\nThe Web Dashboard is now an Admin/Property Manager operational command center. USER-role members remain focused on mobile execution and are redirected away from the management Dashboard.\n\nDashboard capabilities:\n\n- live USER-role workforce table with Online / Working / Offline state;\n- last mobile login time from existing LOGIN audit events;\n- foreground-active duration from mobile heartbeat telemetry;\n- current Property, Work Area, Schedule and Task derived from the assigned IN_PROGRESS ScheduleOccurrence;\n- time in Work Area derived from server-authoritative occurrence start time;\n- auto-updating Task completion Activity Feed with actual duration, planned duration and deviation;\n- latest 20 evidence photos/videos in a private signed-URL carousel with user/work-area/task context;\n- Attention Required panel for overdue, missed and partially completed occurrences;\n- Today's Schedule Progress summary;\n- KPI cards for users online, schedules in progress, tasks completed today, exceptions and average duration deviation.\n\nDashboard polling cadence is approximately 12 seconds. This is intentionally simple and resilient for the first Supervisor Dashboard release; realtime subscriptions/websockets can be added later if scale requires them.\n\n### USER mobile presence\n\nNew additive table: `user_presence`.\n\nThe mobile app sends a best-effort heartbeat every 45 seconds while foregrounded. A worker is considered online when a current heartbeat is present within approximately two minutes. Heartbeat telemetry is not written to AuditLog because doing so would create high-volume noise. Significant actions (login, logout, claim, execution start/completion, evidence, notes) remain audited.\n\nPresence failures never interrupt mobile execution or logout. The Dashboard degrades gracefully if the presence migration has not yet been applied.\n\nMigration file: `supabase-v0.7.0-dashboard.sql`.\n\n### Web navigation / visual modernization\n\nThe existing URLs, APIs and business workflows are preserved. The Web shell is reorganized into a modern role-aware navigation:\n\n- Dashboard (Admin / Property Manager)\n- Operations: Properties, Work Areas, Tasks, Schedules\n- Reports (Admin / Property Manager)\n- Administration: Audit Trail, plus Team / Organization / Subscription / Demo Data where Admin permissions apply\n- Profile / Logout\n\nA new additive `modern.css` theme is loaded after the legacy stylesheet so existing components retain their functional class names while receiving consistent typography, spacing, cards, navigation, tables, forms and responsive behavior.\n\n### Security / privacy\n\n- Dashboard API is server-role-gated to active ADMIN / PROPERTY_MANAGER memberships.\n- Every Dashboard query is Organization-scoped.\n- Evidence remains in the private Supabase Storage bucket; the Dashboard only receives short-lived signed download URLs.\n- Internal notes and audit details are not exposed in the evidence carousel.\n\n### Validation required before merge/deployment\n\nRun Web typecheck and production build, Mobile typecheck and Expo Doctor, then execute the functional regression checklist in `DASHBOARD-v0.7.0-TESTING.md`.\n'''
p.write_text(text)
PY

echo "v0.7.0 Dashboard files applied."
echo "Next: run ./CHECK-v0.7.0.sh, then apply supabase-v0.7.0-dashboard.sql to staging before live-presence testing."

# eDekhbhal v0.6.0 — Mobile Execution Foundation

This release keeps the existing eDekhbhal application as the **Web version** and adds the first installable-mobile codebase under `/mobile`, designed for both Android and iOS.

## Web changes

- Added a visible **Logout** action to the Web navigation.
- Added Organization-level **Schedule Claim Expiry (minutes)**. An Admin can configure how long a USER may reserve a ScheduleOccurrence before scanning its Work Area QR.
- Claim expiry is not hard-coded; the database default is 15 minutes.

## Mobile execution workflow

The mobile application is primarily for active `USER`-role members.

1. USER signs in with the same email identity used by the Web application.
2. **My Work** shows the next unclaimed generated ScheduleOccurrence. There is no early-start restriction: a USER may start an upcoming generated occurrence before its scheduled time.
3. Pressing **Accept / Go to Work Area** atomically claims the occurrence. Merely viewing it does not claim it.
4. If the Work Area QR is not scanned before the Organization's claim-expiry time, the claim is released back to the queue.
5. QR scan validates the active QR against the claimed Work Area. Only a successful scan starts execution.
6. The server records authoritative Schedule and Task start timestamps. The mobile display derives timers from those server timestamps.
7. Task instructions are shown from the occurrence snapshot and can be expanded/minimized.
8. Completing a Task stops that Task timer and immediately starts the next Task timer. The overall Schedule timer continues without resetting.
9. When evidence is required, completion is blocked until the required live camera evidence is saved.
10. After the final Task, the ScheduleOccurrence is completed and the USER is directed back to the next available work.

## Evidence

- v1 quantity: one required photo or one required video (maximum 30 seconds).
- Camera capture only. The mobile app does not include a photo-gallery picker.
- Random evidence is already resolved at occurrence generation; the mobile client only enforces the concrete `evidenceRequired` / `evidenceTypeRequired` result.
- Evidence is uploaded directly to a private Supabase Storage bucket using a short-lived signed upload URL. The Supabase service/secret key remains server-side in Vercel and is never embedded in the mobile app.
- PostgreSQL stores evidence metadata and Storage paths, not the image/video bytes.

## Notes / observations

Users may add append-only notes at either:

- ScheduleOccurrence level, e.g. "Area was occupied and work started late."
- ScheduleOccurrenceTask level, e.g. "Tap is leaking under the sink."

Notes are timestamped, attributed to the USER and audit-trailed.

## Mobile navigation

`My Work | Scan | Report | Profile`

The execution screen also provides Task Note and Schedule Note actions, progress, Task timer, overall Schedule timer, evidence capture and completion.

## Database / Supabase upgrade

Run `supabase-v0.6.0.sql` before deploying v0.6.0. It adds claim/execution fields, Organization claim expiry, occurrence notes, mobile audit actions and the private `execution-evidence` Storage bucket.

## New Vercel server-only environment variables

- `SUPABASE_URL` — the existing Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY` — the server-side Supabase secret/service-role key. **Never expose this to the mobile app or GitHub.**
- `EVIDENCE_BUCKET=execution-evidence`
- `MOBILE_DEV_AUTH_ENABLED=false` is optional; staging automatically exposes Development Sign In when `APP_URL` is the known eDekhbhal staging host.

Existing `DATABASE_URL`, `APP_URL`, `AUTH_SECRET`, `CRON_SECRET` and `DEMO_DATA_ENABLED` remain as previously configured.

## Mobile source

The Expo/React Native project is in `/mobile`. It is excluded from the Next.js root TypeScript build so Vercel can continue deploying the Web/API project independently.

See:

- `MOBILE-SETUP-v0.6.0.md`
- `MOBILE-TESTING-v0.6.0.md`
- `PROJECT-CONTEXT.md`

## Current scope boundary

The Web real-time Supervisor Dashboard is intentionally parked until the mobile execution workflow is validated. The occurrence/execution data produced by this release is designed to feed that dashboard next.

# eDekhbhal v0.7.0 — Dashboard & Web UX Regression Checklist

## Apply order

1. Start from a clean `main` synchronized with GitHub.
2. Extract this package outside the repository or upload it to the repository root.
3. From the repository root run `bash <package-path>/APPLY-v0.7.0.sh`.
4. Run `bash <package-path>/CHECK-v0.7.0.sh`.
5. Apply `supabase-v0.7.0-dashboard.sql` in Supabase staging SQL Editor.
6. Deploy to Vercel staging only after automated checks pass.

## Dashboard authorization

- ADMIN can open `/dashboard`.
- PROPERTY_MANAGER can open `/dashboard`.
- USER is redirected to `/tasks` and cannot call `/api/dashboard/live` successfully.
- Dashboard data contains only the signed-in Organization.

## Live workforce

With a USER signed into the current mobile app:

- heartbeat begins without disrupting normal mobile use;
- user becomes Online within the next dashboard refresh;
- `Last Login` reflects the latest mobile magic-link login where available;
- `Active For` increases while the app remains foregrounded;
- backgrounding the app causes Online to expire after about two minutes;
- returning foreground makes the user Online again;
- logout marks the presence offline best-effort;
- if the user starts an occurrence by QR, Property / Work Area / current Task are correct;
- `In Area For` is based on the server occurrence start timestamp.

## Activity Feed

Complete known Tasks in mobile and verify:

- newest completion appears near the top within ~12 seconds;
- timestamp matches occurrence timezone;
- user, task, work area, property and schedule are correct;
- actual duration matches mobile/server execution data;
- planned duration and deviation are correct.

## Evidence carousel

Upload required photo/video evidence and verify:

- newest evidence enters the last-20 carousel;
- photo preview opens enlarged;
- video opens with controls;
- card identifies Work Area, Task, user and capture time;
- evidence remains private (short-lived signed URLs only);
- missing/unavailable media does not crash the dashboard.

## Attention / progress

- overdue PENDING occurrences appear as Attention Required;
- MISSED and PARTIALLY_COMPLETED occurrences appear appropriately;
- today's Completed / In Progress / Upcoming / Overdue / Missed / Partial counts are plausible.

## Existing Web regression

Open and smoke-test without changing business logic:

- Properties: list, create/edit/status where authorized;
- Work Areas: list, create/edit/status and existing Property-detail QR controls;
- Tasks: list, create/edit/rich text/attachments;
- Schedules: list/create/edit/duplicate/reorder/evidence rules;
- Reports -> Service Log: date/user/property/work-area/task-list filters and all-column sorting;
- Team;
- Organization settings / working hours;
- Audit Trail;
- Subscription;
- Profile and Logout;
- Demo Data page in staging when enabled;
- public QR route still resolves existing QR pages;
- mobile claim -> QR scan -> timers -> evidence -> completion remains functional.

## Repository hygiene

Only canonical source under `src/`, `prisma/`, `mobile/` and the canonical root context/migration files should be intentionally changed. Do not re-enable stale flattened root duplicate source files in TypeScript or Prisma discovery.

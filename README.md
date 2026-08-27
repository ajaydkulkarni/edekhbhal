# eDekhbhal v0.5.2

This release extends Schedules with a recurring End Date, hierarchical Working Hours, and the database/generation foundation for real-time Schedule execution.

## Recurring Schedule End Date
Recurring Schedules now have an optional End Date. If entered, the Schedule remains eligible through 11:59 PM on that calendar date in the Schedule/Work Area timezone. A blank End Date means the recurrence has no date-based end.

## Working Hours hierarchy
Working hours can be defined at:
1. Organization
2. Property (inherit Organization or override)
3. Work Area (inherit Property or override)

Organization `workingHours = null` means unrestricted / 24x7. At Property and Work Area levels, `null` means inherit. Multiple working windows per weekday and overnight windows such as 22:00-06:00 are supported.

Occurrence generation uses the effective Work Area hours. It creates an occurrence only if the *entire planned Schedule* fits inside an open working-hours window.

## ScheduleOccurrence foundation
The following tables are added:
- `ScheduleOccurrence`: one immutable planned occurrence of a Schedule.
- `ScheduleOccurrenceTask`: snapshots the ordered Tasks, descriptions, planned times, durations, and evidence decision for that occurrence.
- `ScheduleOccurrenceEvidence`: future mobile evidence records pointing to external storage paths/thumbnails.

Completed/in-progress execution records are never regenerated. Future PENDING occurrences are reconciled when a Schedule definition changes.

## Random evidence
For a Schedule Task configured as `1 in N`, each occurrence stores a concrete `evidenceRequired` decision. The generator deterministically chooses one position within each block of N performances, avoiding long random gaps while keeping the selected position unpredictable to the normal user workflow.

## Rolling occurrence generator
`/api/cron/schedule-occurrences` generates/reconciles a 48-hour rolling horizon. `vercel-cron.example.json` contains a three-times-daily example (00:15, 08:15, and 16:15 UTC). It is deliberately not activated as `vercel.json`, because Vercel Cron frequency/availability depends on the Vercel plan. Schedule create/edit still triggers immediate generation/reconciliation, so newly created Schedules do not wait for the next batch. After confirming the project plan, copy/merge the example cron entries into the project’s active Vercel configuration, or call the protected endpoint from another scheduler.

Set a private Vercel environment variable named `CRON_SECRET`. The endpoint requires `Authorization: Bearer <CRON_SECRET>`.

## Audit
Occurrence generation/reconciliation is audit-trailed with generated/skipped counts and generation horizon. Schedule edits continue to retain old/new snapshots.

## Upgrade order
1. Run `supabase-v0.5.1.sql` in Supabase SQL Editor.
2. Add `CRON_SECRET` in Vercel environment variables.
3. Upload/deploy the v0.5.1 code.
4. Configure a scheduler to call the protected occurrence endpoint up to three times daily (the included Vercel example can be activated if supported by your Vercel plan).
5. Test Organization → Property → Work Area working-hours inheritance and create a recurring Schedule with an End Date.


## v0.5.2 — Staging Demo Data Admin utility

Adds a staging-only `/admin/demo-data` page. When `DEMO_DATA_ENABLED=true` is set in the
eDekhbhal staging Vercel project, an authenticated Admin can populate/refresh the canonical
demo dataset directly from the deployed application. No local Node/Prisma environment is required.

No database migration is required for v0.5.2.

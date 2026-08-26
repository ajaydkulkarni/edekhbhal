# eDekhbhal v0.5.0

Schedules release.

## New Schedules module

Schedules are organization-scoped planning definitions that connect one Work Area with one or more reusable Tasks.

Only `ADMIN` and `PROPERTY_MANAGER` can create, edit, duplicate, inactivate, reactivate, or reorder Schedules. `USER` can view them.

### Schedule fields
- Schedule Name
- One Time or Recurring
- Recurrence builder: every N minutes, hours, days, weeks, months, or years
- Weekly selected weekdays
- Monthly selected calendar day(s)
- Start date/time and Work Area/Property timezone
- Work Area selector with parent Property always visible
- One or more organization Tasks

### Per-Schedule Task
- Sequence
- Planned duration in strict `HH:MM`
- Automatically calculated first-occurrence Task Start and End
- Evidence requirement:
  - None
  - Photo every performance
  - Video every performance
  - Random evidence: 1 in every N performances, with Photo / Video / Either

Reordering Tasks or changing duration recalculates all subsequent planned times immediately.

### Random evidence
v0.5.0 stores the rule (`1 in N`) and evidence type. The future execution engine will implement randomized sampling across blocks of N performances so evidence is required once per block at a randomized position rather than using an independent probability on every run.

### Audit
Schedule create, update, inactivate, reactivate and duplicate operations are audit-trailed. Schedule update audit snapshots include frequency, Work Area, ordered Tasks, duration and evidence settings, so task additions/removals/reordering and evidence changes are preserved in old/new values.

## Database upgrade
Before testing v0.5.0, run `supabase-v0.5.0.sql` in Supabase SQL Editor.

## Existing staging configuration
Keep the existing Vercel environment variables, including the Supabase pooled `DATABASE_URL` with `pgbouncer=true&connection_limit=1`.

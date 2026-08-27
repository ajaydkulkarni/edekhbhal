# eDekhbhal Demo Seed

This seed is intended for staging/demo/test data only.

It is **idempotent**: it uses stable seed IDs and upserts the demo master data. Running it again resets the seeded definitions to the canonical demo values while leaving unrelated Organization data untouched.

For demo Schedules, a re-run removes only **future PENDING** generated occurrences for those seeded schedules before regenerating the next 48-hour horizon. Historical, in-progress, and completed occurrences are preserved.

## What it creates

- 1 demo Organization
- 6 demo Users
  - 1 ADMIN
  - 2 PROPERTY_MANAGER
  - 3 USER accounts (including a Supervisor-labelled user for future dashboard testing)
- 3 Properties
- 10 Work Areas
- 1 active QR record for each Work Area
- 15 reusable Organization-level Tasks with rich HTML instructions
- 8 Schedules with variations:
  - One-time
  - Every 30 minutes
  - Every 2 hours
  - Daily
  - Weekly selected weekdays
  - Monthly
  - Photo evidence
  - Video evidence
  - Random `1 in N` evidence
- Professional demo Subscription
- Initial seed audit events
- Upcoming ScheduleOccurrence / ScheduleOccurrenceTask rows for the rolling 48-hour horizon


The script automatically reads `.env.local` and then `.env` if they exist. Environment variables already set in the shell take precedence. The file must provide the staging `DATABASE_URL` unless it is already exported in your shell.

## Safety gate

The script refuses to run unless `DEMO_SEED_CONFIRM=YES`.

### Windows PowerShell

```powershell
$env:DEMO_SEED_CONFIRM="YES"
npm run db:seed:demo
```

### macOS / Linux

```bash
DEMO_SEED_CONFIRM=YES npm run db:seed:demo
```

The command uses the `DATABASE_URL` already configured in the environment.

**Do not run this against a production database unless you intentionally want the demo Organization there.**

## Optional environment variables

- `DEMO_ORG_ID` — defaults to `seed_demo_org_edekhbhal`
- `DEMO_ORG_NAME` — defaults to `eDekhbhal Demo Operations`
- `DEMO_TIMEZONE` — defaults to `America/Denver`
- `DEMO_SEED_GENERATE_OCCURRENCES=false` — seed master data without generating the rolling occurrence horizon

## Demo login emails

The users are created with verified email flags and use the application's existing magic-link login flow:

- `demo.admin@edekhbhal.test`
- `demo.pm1@edekhbhal.test`
- `demo.pm2@edekhbhal.test`
- `demo.supervisor@edekhbhal.test`
- `demo.worker1@edekhbhal.test`
- `demo.worker2@edekhbhal.test`

No passwords are created or stored by the seed.

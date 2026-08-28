# eDekhbhal v0.6.1 — Reports Foundation / Service Log

This patch adds the first Web report without any database migration.

## Included

- `Reports` navigation entry for ADMIN and PROPERTY_MANAGER.
- `/reports` report landing page.
- `/reports/service-log` Service Log report.
- Filters: Property, Work Area, Task List (Schedule), User.
- Latest 500 completed Task performances.
- Planned vs actual task duration and deviation.
- Historical snapshot names and occurrence timezone-aware display.
- Updated canonical `PROJECT-CONTEXT.md`.

## Apply

Extract this ZIP into the repository root, preserving folders and replacing `src/components/Nav.tsx` and `PROJECT-CONTEXT.md`.

Then commit and push:

```bash
git add src/app/reports src/components/Nav.tsx PROJECT-CONTEXT.md
git commit -m "Add Service Log reports foundation"
git push
```

Vercel should deploy automatically from `main`.

## Validate

1. Sign in as an ADMIN or PROPERTY_MANAGER.
2. Confirm `Reports` appears in the Web navigation.
3. Open `Reports -> Service Log`.
4. Confirm completed mobile Task executions appear.
5. Compare one row with the corresponding mobile execution:
   - Property / Work Area
   - Task List / Schedule
   - sequence
   - Task name
   - actual duration
   - planned duration
   - deviation
   - user
   - date/start/end
6. Test each filter.

No Supabase SQL or new Vercel environment variable is required.

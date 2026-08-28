# eDekhbhal v0.6.1 — Service Log Report Patch

This patch adds the first Reports foundation to the Web application.

## Included

- `Reports` navigation item for ADMIN and PROPERTY_MANAGER.
- `/reports` landing page.
- `/reports/service-log` report.
- One row per completed Task performance.
- Filters for:
  - From Date
  - To Date
  - Property
  - Work Area
  - Task List / Schedule
  - User
- Date filter boundaries use the Organization timezone.
- Click any table column heading to sort ascending/descending.
- Sortable columns:
  - Property
  - Work Area
  - Task List
  - Sr. No.
  - Task Performed
  - Actual Time Taken
  - Scheduled Time
  - Deviation
  - User
  - Date
  - Start Time
  - End Time
- Latest 500 matching completed Task performances are loaded.
- Historical snapshot fields are used so later master-data edits do not rewrite history.

## No database migration required

All required Service Log fields already exist in the v0.6.0 occurrence/execution data model.

## Install

Extract the ZIP into the repository root so the included `src/...` paths merge into the existing source tree.

Then run:

```bash
npm run typecheck
npm run build
```

If both succeed:

```bash
git add src/app/reports src/components/Nav.tsx PROJECT-CONTEXT.md
git commit -m "Add sortable Service Log with date filters"
git push
```

Vercel should deploy automatically from `main`.

## Test

1. Log in as an ADMIN or PROPERTY_MANAGER.
2. Open **Reports -> Service Log**.
3. Verify a known mobile-completed Task appears.
4. Filter by a single date by setting From Date and To Date to the same date.
5. Filter by a date range.
6. Filter by User and verify only that user's completed Tasks appear.
7. Combine date + Property + Work Area + Task List + User filters.
8. Click each column heading and verify ascending/descending sorting.
9. Compare Actual Time Taken, Scheduled Time, Deviation, Start Time and End Time against the corresponding mobile execution.

## Notes

- Times shown in the table use the occurrence timezone.
- Date filter boundaries use the Organization timezone.
- Sorting applies to the matching rows loaded into the report (up to 500 rows).
- The Work Area standalone QR controls and public QR transparency enhancement are **not** part of this patch; they remain planned for the next increment.

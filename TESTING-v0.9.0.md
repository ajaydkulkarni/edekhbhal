# eDekhbhal v0.9.0 — Staging Functional Regression

## A. Smart recurring-schedule supersession

Use a recurring test Schedule with a short interval (for example every 5 minutes).

1. Ensure occurrence #1 becomes due and do not start it.
2. Before occurrence #2 is due, confirm #1 remains available.
3. When #2 becomes due, refresh **My Work**.
4. Expected:
   - #1 is no longer actionable.
   - #1 is `MISSED` in Web compliance/history.
   - #1 `missedReason` says it was automatically missed when the next occurrence became due.
   - #2 is the current actionable occurrence.
5. Do not perform #2; wait for #3.
6. Expected: #2 becomes MISSED and #3 becomes actionable.
7. Start #3 before #4 becomes due.
8. Expected: #3 remains `IN_PROGRESS`; it is never auto-missed.
9. Complete #3.
10. Confirm completed history remains unchanged.

Also test a claimed-but-not-started occurrence:
- claim occurrence #1;
- let #2 become due;
- refresh queue;
- #1 must be MISSED and its claim cleared.

## B. Public Work Area QR

1. Open **Work Areas → Service Status**.
2. Open the current public QR link.
3. Test the printed QR with the phone's normal camera app, without opening eDekhbhal.
4. Expected public page:
   - Work Area;
   - Property;
   - last service;
   - service status/date/time/duration;
   - next scheduled service;
   - recent service history.
5. Confirm public page does NOT display:
   - worker name/email;
   - notes;
   - evidence;
   - audit records;
   - admin links/data.
6. Regenerate the Work Area QR using the existing QR management function.
7. Expected:
   - old QR URL no longer resolves to Work Area data;
   - new QR opens the public service status.
8. Confirm eDekhbhal mobile execution still validates the new QR.

## C. Compliance & analytics

Open **Reports → Service Compliance & Analytics**.

Test:
- date range;
- Property filter;
- Work Area filter;
- Schedule filter;
- User filter;
- status filter.

Verify:
- Completed;
- Partial;
- Missed;
- service-compliance %;
- By Schedule;
- By Property;
- By Work Area;
- By User;
- occurrence detail links.

Auto-superseded occurrences must remain visible as MISSED.

## D. Occurrence drill-down

Open a Completed occurrence:
- snapshot names correct;
- user/timestamps/durations correct;
- Tasks listed in sequence;
- Task/Session notes visible to management;
- private evidence preview works through signed URLs.

Open an auto-MISSED occurrence:
- reason visible;
- no history is rewritten.

## E. Service Log export

Open **Reports → Service Log**.

1. Apply a set of filters.
2. Export CSV.
3. Export XLSX.
4. Confirm both use the same filters.
5. Confirm task rows, user, actual/planned duration and timestamps are present.
6. Confirm USER-role accounts cannot call export endpoints.

## F. Dashboard regression

- Users Online heartbeat still works.
- In-progress execution still appears.
- Attention Required shows MISSED items.
- No stale superseded occurrence remains actionable in mobile.

## G. Existing mobile execution regression

Using the installed v0.8.1 Android app:

claim → QR → server timers → Task execution → evidence → notes → completion → Dashboard → Reports.

No new APK is required for v0.9.0.

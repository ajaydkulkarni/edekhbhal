# eDekhbhal Mobile Testing Checklist — v0.6.0

## Prerequisites

- `supabase-v0.6.0.sql` completed successfully.
- v0.6.0 Web/API deployed successfully to Vercel.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `EVIDENCE_BUCKET` configured in Vercel.
- Demo data exists with at least one active `USER`, active Work Area QR, and upcoming generated ScheduleOccurrence.
- Test on a physical phone for camera/QR/video behavior.

## 1. Web Logout

- Login to Web.
- Confirm **Logout** is visible.
- Logout.
- Confirm the session is removed and `/login` is shown.

## 2. Organization Claim Expiry

- Login to Web as ADMIN.
- Organization → set Schedule Claim Expiry to a small test value such as 2 minutes.
- Save and refresh.
- Confirm the value persists.

## 3. Mobile Sign In

- Enter an active USER email.
- Use staging **Development Sign In**.
- Confirm My Work opens.
- Confirm ADMIN/PROPERTY_MANAGER-only identities are rejected from the USER execution queue unless they also have a separate active USER membership in another Organization.

## 4. Queue and atomic claim

- Confirm My Work shows the earliest unclaimed generated occurrence.
- Confirm a future occurrence can be accepted before scheduled time.
- Press **Accept / Go to Work Area**.
- Confirm it becomes CLAIMED and displays the reservation expiry.
- On a second USER/device, confirm the same occurrence is no longer available.

## 5. Claim expiry

- Claim work but do not scan the QR.
- Wait past the Organization claim-expiry period.
- Refresh another USER's queue.
- Confirm the occurrence returns to AVAILABLE.
- Confirm an audit event `SCHEDULE_CLAIM_EXPIRED` is present.

## 6. Wrong QR

- Claim a Schedule.
- Scan a QR belonging to a different Work Area.
- Confirm the application rejects it and timers do not start.

## 7. Correct QR / authoritative timers

- Scan the correct active Work Area QR.
- Confirm Schedule becomes IN_PROGRESS.
- Confirm Task 1 starts automatically.
- Confirm Task timer and Overall Schedule timer both run.
- Background/reopen the app and confirm displayed elapsed time reconstructs from server timestamps.

## 8. Task instructions

- Confirm rich instructions display.
- Minimize and expand instructions.

## 9. Notes

- Add a Task note such as `Tap is leaking under the sink.`
- Add a Schedule note such as `Area was occupied for 10 minutes.`
- Confirm both display in execution notes.
- Confirm audit entries are created.

## 10. Evidence: PHOTO

- Use a Task whose generated occurrence requires PHOTO.
- Confirm **Complete Task** is disabled before evidence.
- Confirm the app opens the live camera.
- Confirm there is no gallery/image-picker action.
- Capture one photo.
- Confirm upload succeeds and completion is enabled.
- Confirm a `ScheduleOccurrenceEvidence` row exists and the object exists in private Supabase Storage.

## 11. Evidence: VIDEO

- Use a Task requiring VIDEO.
- Confirm microphone/camera permissions are requested as needed.
- Record video.
- Confirm recording stops automatically by 30 seconds or can be stopped earlier.
- Confirm evidence saves and Task can complete.

## 12. Random evidence

- Use generated demo occurrences for a ScheduleTask configured as Random 1-in-N.
- Confirm the mobile app follows the pre-generated `evidenceRequired` decision rather than making its own random choice.

## 13. Task transition

- Complete Task 1.
- Confirm Task 1 actual duration is stored.
- Confirm Task 2 immediately becomes IN_PROGRESS.
- Confirm Task timer resets from Task 2's server start timestamp.
- Confirm overall Schedule timer continues from original QR scan.

## 14. Schedule completion

- Complete the final Task.
- Confirm occurrence becomes COMPLETED.
- Confirm actual Schedule duration is stored.
- Confirm app offers **Next Available Work** and returns to My Work.

## 15. Report

- Open Report.
- Confirm completed work appears with planned and actual durations.

## 16. Profile / Logout

- Confirm USER/profile data displays.
- Logout.
- Confirm locally stored mobile session token is cleared.

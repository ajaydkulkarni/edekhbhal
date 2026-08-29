# Fine-tuning Batch 01 Test Plan

## Audit
- Filter From/To, Who, Action, Entity Type, Entity ID.
- Search text that appears in Old/New JSON.
- Verify pagination and Clear/Reset.
- Export CSV and Excel; confirm active filters/search carry through.

## Team / Personnel
- Admin adds USER with one Property.
- Admin adds PROPERTY_MANAGER with multiple Properties.
- Open User profile and enter address, phones, Notes.
- Add/take profile picture.
- Upload Driver's License plus a second verification document.
- USER opens own self-service profile: personnel fields/documents visible, Notes absent.
- USER cannot open another person's profile.

## Property assignments
- Admin changes assignments from Team profile.
- Admin changes assignments from Property → Team Assignments.
- Property Manager sees only assigned Properties.
- Property Manager can view Property team assignment tab but cannot change assignments.
- Property Manager cannot edit Property master data.
- User with no assigned Properties receives an EMPTY mobile queue.
- Assigned User sees only work under assigned Properties.

## Regression
- Admin Property create/edit.
- Work Area QR View/Reprint/Regenerate.
- schedule supersession.
- Dashboard and Reports load.

## RLS gate
Do not enable RLS yet. After this passes, finish endpoint-level property scoping, then implement/test RLS in staging before calling the next meaningful release production-ready.

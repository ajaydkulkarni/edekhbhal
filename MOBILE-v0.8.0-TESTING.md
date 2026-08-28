# eDekhbhal v0.8.0 Functional Regression Checklist

## Authentication & Profile

- Sign in with existing magic-link/development staging flow.
- Profile shows Display Name, email, USER role, Organization and timezone.
- Edit Display Name and save; refresh/reopen app and confirm persistence.
- Set a password (minimum 8 characters); confirm no password is displayed back to the user.
- Sign out using the prominent Sign Out action and confirmation dialog.
- Sign in again using Email + Password.
- Change password from a password-authenticated session: wrong current password must fail; correct current password must succeed.
- Recovery test: sign in through magic link and reset password without the old password.
- Confirm other mobile sessions are invalidated after password change.

## Heartbeat / Dashboard

- With the new APK foregrounded, Dashboard `Users Online` increments within about one heartbeat cycle.
- Live Workforce shows Online/Working instead of `Working · no heartbeat` while app is foregrounded.
- Background the app for >2 minutes and confirm the user drops from Users Online.
- Bring app foreground and confirm online state returns.
- Sign out and confirm presence becomes inactive.

## Language Preference

- With no preference set, all mobile execution remains English.
- Select each desired language from Profile and save.
- Confirm tab labels, Profile, execution labels, Scan and Reports use the selected language. All worker-facing v0.8 screen keys used by these authenticated screens have bundled strings for the 13 initial languages.
- Organization / Property / Work Area identifiers remain unchanged.
- Confirm Arabic text renders without breaking navigation/layout.

## Dynamic Task Translation

- Configure a staging translation provider before this test.
- Select a non-English language.
- Open an assigned occurrence and confirm Schedule/Task name and instructions translate.
- Confirm English source Task name/instructions remain available for comparison.
- Reopen the same Task and confirm translation is fast/cached.
- Change the source Task for a future occurrence and confirm a new source hash produces an updated translation rather than stale text.
- Temporarily remove/disable the translation provider and confirm execution still works with English content fallback.

## Speaker / Text-to-Speech

- Press Read Instructions for an English Task and confirm Task name + instructions are spoken.
- Select a translated language and confirm translated content uses the selected language voice when available on the device.
- Stop Reading interrupts speech.
- Long instructions do not crash; chunks play in order.
- Starting/completing another Task stops old speech.

## Notes keyboard fix

- Open Task Note on Android; keyboard must not cover typed text.
- Save Note and Cancel must remain reachable above the keyboard.
- Enter a multiline note and scroll within the field.
- Repeat for Schedule Note.
- Confirm notes remain append-only and appear in execution/history.

## Personal Reports

- Report tab shows the USER's own work only.
- Test Today / 7 Days / 30 Days.
- Test Custom From/To using `YYYY-MM-DD`.
- Search by Task name, Schedule name, Property and Work Area.
- Open Show Details and verify Task status, planned/actual duration, evidence count and notes.
- Test Previous/Next pagination when more than 10 results exist.
- Confirm another USER's work cannot be returned by changing search/filter inputs.

## Existing Execution Regression

- My Work shows available occurrence without claiming on view.
- Accept claims the occurrence.
- Work Area QR scan starts server-authoritative Schedule + Task timers.
- Current Work Area and time-in-area continue to populate Supervisor Dashboard.
- Camera-only evidence remains enforced; gallery selection remains unavailable.
- Photo evidence works.
- Video evidence works and max duration remains 30 seconds.
- Required evidence blocks Task completion until captured.
- Complete Task advances execution correctly.
- Complete Final Task completes occurrence and updates Dashboard Activity Feed.
- Dashboard evidence carousel receives new evidence.
- Web Service Log still receives completed task records.

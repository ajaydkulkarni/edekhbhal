# eDekhbhal Next Preview 01 — Web + Mobile

This is the first deployable test build of the new eDekhbhal experience.

Included:
- redesigned public landing page
- embedded explainer MP4
- functional Login / Registration links
- redesigned Schedule Builder
- Task Library + Ad-hoc Task selection
- ad-hoc "use this Schedule only" default
- optional save-to-Task-Library
- public QR full latest-service breakdown
- task performer display name
- task start/end, scheduled/actual duration, variance and % variance
- previous two service completions with expandable breakdown
- future subscription entitlement foundation (feature or limit/user-count style)
- refreshed mobile design tokens/navigation
- Android versionCode 4

## Safe deployment
Use a parallel branch, recommended: `v2-rebuild`.
Do not replace the known-good staging environment until this preview is validated.

## Database first
Run `payload/sql/next-preview-01.sql` in Supabase staging SQL Editor.

## Apply
After uploading extracted files to the selected GitHub branch preserving paths:
```bash
git pull
bash APPLY-next-preview-01.sh
bash CHECK-next-preview-01.sh
```
Do not commit unless CHECK is green.

## Commit
```bash
git add -A
git commit -m "Start eDekhbhal Next preview with ad-hoc work and public QR detail"
git push
```

## Mobile
The included `mobile/app.json` uses Android versionCode 4. It points to the existing staging API URL. If the new web preview uses a different URL, update `mobile/app.json` -> `expo.extra.apiUrl` before building.

```bash
cd mobile
npm ci
npx expo-doctor
eas build --platform android --profile preview
```
Use the existing Expo/EAS project and signing credentials. Do not create a new Expo project or keystore.

RLS is not enabled by this preview.

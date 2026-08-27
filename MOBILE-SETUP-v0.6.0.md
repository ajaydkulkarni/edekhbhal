# eDekhbhal Mobile Setup — v0.6.0

This guide assumes the Web/API application is hosted on Vercel and PostgreSQL/Storage are hosted by Supabase. No local development environment is required for the normal staging workflow.

## A. Upgrade Supabase first

1. Open the eDekhbhal staging project in Supabase.
2. Open **SQL Editor**.
3. Run the complete contents of `supabase-v0.6.0.sql`.
4. Confirm the script completes successfully.

The script creates the private `execution-evidence` Storage bucket and adds the mobile execution schema.

## B. Add Vercel environment variables

In **Vercel → edekhbhal-staging → Settings → Environment Variables**, add:

### `SUPABASE_URL`

Use the same Supabase project URL already used by eDekhbhal, for example the project URL shown in Supabase Project Settings.

### `SUPABASE_SERVICE_ROLE_KEY`

Use the **server-side secret/service-role key** from Supabase Project Settings/API Keys. Do not use the publishable/anon key here.

This value is highly privileged:

- store it only as a Vercel **Secret**;
- never commit it to GitHub;
- never put it in `mobile/.env` or an `EXPO_PUBLIC_*` variable;
- never paste it into screenshots or chat.

### `EVIDENCE_BUCKET`

Set:

`execution-evidence`

The SQL migration creates this bucket as private.

### Optional `MOBILE_DEV_AUTH_ENABLED`

For the known staging URL, Development Sign In is enabled automatically by the backend. You normally do not need this variable. Keep it `false` elsewhere.

## C. Deploy Web/API v0.6.0

Upload the extracted v0.6.0 source to the GitHub repository root, preserving folders. Vercel will deploy the Next.js Web/API project.

Expected new API families include:

- `/api/mobile/auth/*`
- `/api/mobile/queue/next`
- `/api/mobile/occurrences/*`
- `/api/mobile/occurrence-tasks/*`
- `/api/mobile/reports/my-performance`

The `/mobile` folder is a separate Expo project and is excluded from the Web TypeScript build.

## D. Prepare an installable mobile build with Expo EAS

The mobile source is already under `/mobile` and targets both Android and iOS. Vercel does not produce native `.apk`/`.aab`/`.ipa` binaries; native builds should be produced by Expo EAS Build.

Because no local environment is maintained, the recommended operational path is to connect the GitHub repository to an Expo account / EAS workflow and let EAS build in the cloud. Initial Expo/EAS project ownership and Apple/Google signing credentials require explicit account authorization by the project owner.

For early testing:

- Android: use the `preview` EAS profile to produce an installable APK.
- iOS: use internal/ad-hoc distribution or TestFlight. Apple requires a paid Apple Developer account and provisioning/signing authorization.

For store release later:

- Android production build → Google Play.
- iOS production build → App Store Connect/TestFlight/App Store.

The mobile API URL defaults to:

`https://edekhbhal-staging.vercel.app`

and can be overridden at build time with:

`EXPO_PUBLIC_API_URL`

Only public configuration belongs in `EXPO_PUBLIC_*`. Never put Supabase server secrets there.

## E. Staging authentication

The mobile app uses the same email identity model as the Web version.

On staging, real outbound email is not yet connected, so requesting a mobile sign-in link returns a **Development Sign In** option. Production email/deep-link delivery will be wired before a public mobile release.

Only active Organization members with role `USER` are currently allowed into the mobile work queue.

## F. Recommended first test account

Use one of the seeded `USER` accounts, such as:

`demo.worker1@edekhbhal.test`

Populate demo data first from the Web staging Admin **Demo Data** utility if needed.

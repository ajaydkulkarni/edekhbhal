# eDekhbhal v0.8.0 — Mobile UX, Localization & Personal Reporting

This is a **staged package**. Upload the extracted package folder/files to GitHub first. The application payload is isolated under `v0.8.0-files/` so it cannot collide with the older v0.7 staged `files/` directory already present in the repository. It does not change the live application until `APPLY-v0.8.0.sh` is run in the Codespace and the resulting application changes are committed/pushed.

## Included scope

- Email + Password mobile sign-in, while retaining magic-link sign-in/recovery.
- Editable Display Name and preferred language in Mobile Profile.
- Password set/change with scrypt hashing; no plaintext password storage.
- Confirmed Sign Out button and presence cleanup.
- 13-language mobile UI preference with English default; current authenticated worker-screen keys are bundled for all 13 languages.
- Server-side cached translation for Schedule/Task content.
- Speaker / text-to-speech for Task name + detailed instructions.
- Android/iOS keyboard-safe Task/Schedule Notes modal.
- Searchable/paginated Personal Reports with date presets and Custom dates.
- Existing v0.7.0 mobile foreground heartbeat retained for the next APK.
- Release context snapshot included at `release-context/PROJECT-CONTEXT.md`; `APPLY-v0.8.0.sh` updates the repository-root canonical `PROJECT-CONTEXT.md` in place.

## Safe sequence

1. Extract this ZIP on your computer. Open the extracted `edekhbhal-v0.8.0-mobile-ux` folder and upload **its contents** to the eDekhbhal repository root (do not upload the outer ZIP itself). Preserve the `v0.8.0-files/` directory structure.
2. In Codespaces:

```bash
cd /workspaces/edekhbhal
git pull
bash APPLY-v0.8.0.sh
git status --short
```

3. Run compile/build validation:

```bash
bash CHECK-v0.8.0.sh
```

4. Only after all checks pass, run `supabase-v0.8.0-mobile-profile-i18n.sql` in the **staging Supabase SQL Editor**.
5. Configure one translation provider in Vercel staging. Preferred option: `GOOGLE_TRANSLATE_API_KEY`. Alternative: `TRANSLATION_API_URL` plus optional `TRANSLATION_API_KEY`. Never put key values in GitHub or chat.
6. Commit/push the applied application changes. Let Vercel deploy and run the functional checklist in `MOBILE-v0.8.0-TESTING.md`.
7. Build the replacement Android APK only after the Web/API deployment and mobile field regression are green.

## Translation behavior

The English Task/Schedule snapshots remain authoritative. Translation is presentation-only and cached. Notes are stored exactly as entered and are **not silently translated**.

If no translation provider is configured, the mobile UI dictionaries still localize supported interface labels, while dynamic Task/Schedule content safely falls back to English. Translation failure never blocks work execution.

## Database migration safety

The v0.8.0 SQL migration is additive. It adds profile/password/session fields and the translation cache table; it does not rewrite Tasks, Schedules, Occurrences, evidence, notes, or existing audit history.

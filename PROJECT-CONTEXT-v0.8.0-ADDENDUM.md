# PROJECT-CONTEXT v0.8.0 Addendum

Canonical file remains repository-root `PROJECT-CONTEXT.md`. `APPLY-v0.8.0.sh` updates that file in place and appends the complete v0.8.0 section without discarding prior history.

Release: **v0.8.0 — Mobile UX, Localization & Personal Reporting**

Key locked decisions:

- Display Name is editable; email remains the authentication identity.
- Mobile supports Email + Password after password setup; magic-link login remains initial access/recovery.
- Passwords use one-way scrypt hashes; no plaintext password storage/logging.
- Preferred language defaults to English when null.
- Static mobile UI uses bundled translations; dynamic Task/Schedule prose is server translated and cached.
- English occurrence snapshots remain authoritative and are never rewritten by translation.
- Notes are preserved exactly as typed.
- TTS is device-side Expo Speech and reads translated content when available.
- Notes modal is keyboard-safe and top-positioned.
- Personal Reports remain tenant/user scoped and are searchable/paginated.
- v0.7.0 mobile heartbeat remains best-effort/non-blocking and becomes visible in Dashboard after the replacement APK is installed.
- Additive migration: `supabase-v0.8.0-mobile-profile-i18n.sql`.
- Dynamic translation provider secrets belong only in Vercel environment configuration, never GitHub.

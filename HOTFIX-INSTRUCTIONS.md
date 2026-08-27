# eDekhbhal v0.6.0 — Logout Visibility Hotfix

The Web Logout control already exists and the logout API is implemented correctly.
The issue is visual: the Logout button did not explicitly set a text color. On the dark
navigation bar, the browser default button text color can make it appear missing.

This hotfix:
- makes Logout explicitly white,
- gives it a subtle visible border/background,
- prevents it from shrinking away at the far right of the navigation bar.

Upload this file to GitHub, replacing the existing file:

`src/app/globals.css`

No Supabase SQL changes.
No Vercel environment-variable changes.

# eDekhbhal v0.7.0 Dashboard package

This package is intentionally not auto-deployed. It adds the Supervisor Dashboard, mobile foreground-presence heartbeat, role-aware modern Web navigation/theme, and the staging SQL migration.

Use the apply/check scripts from a GitHub Codespace so the current repository is preserved and fully compiled before any push to `main`.

Important: run `supabase-v0.7.0-dashboard.sql` in the staging Supabase SQL Editor before testing live Online/Active presence. If it is not yet applied, the dashboard is designed to degrade gracefully and continue showing execution/feed/evidence information while presence displays as unavailable.

## Scope note

This release does not change the existing QR implementation. The previously agreed standalone Work Areas QR controls and public last-service transparency page remain the next focused Web functionality increment after the dashboard/theme regression pass. Keeping them separate reduces regression risk while the new application shell is stabilized.

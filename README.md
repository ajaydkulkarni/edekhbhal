# eDekhbhal v0.2.1

This build completes the first end-to-end operational cycle:

**Register → Authenticate → Create Organization → Create Property → Create Work Area → Generate QR → Reprint QR → Regenerate QR → Scan QR → Audit Trail**

## Staging configuration

Required Vercel environment variables:

- `DATABASE_URL` — Supabase pooled PostgreSQL connection string. For Supabase transaction pooler use `?pgbouncer=true&connection_limit=1`.
- `APP_URL` — e.g. `https://edekhbhal-staging.vercel.app`
- `AUTH_SECRET` — retained for future auth hardening.

## QR lifecycle

A QR code is represented by a `QrCode` database record. Its public QR URL uses the random Prisma/CUID record ID.

- **Reprint** reconstructs exactly the current active QR from the existing QR record ID.
- **Regenerate** revokes the current QR record and creates a brand-new QR record, so the old QR becomes invalid while the Work Area ID remains unchanged.
- Scanning a revoked QR returns 404.
- QR generation/reprint/regeneration are audited.

## Notes

Email sending is still intentionally not connected; authentication uses the displayed development link.
This is a staging build, not yet production hardened.

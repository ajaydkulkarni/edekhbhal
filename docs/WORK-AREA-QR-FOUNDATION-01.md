# Work Area + QR Lifecycle Foundation 01

Target hierarchy:

`Organization → Site → Work Area`

Implemented security and lifecycle:

- Work Area belongs to both Organization and Site.
- Site access is enforced through `app_private.has_site_access`.
- ADMIN receives Organization-wide Site access.
- SITE_MANAGER / USER Site scope is prepared through `site_membership_scope`.
- RLS + FORCE RLS on Work Area, QR, Site scope, and idempotency tables.
- Work Area create/status management requires ADMIN or SITE_MANAGER.
- Work Area state changes use optimistic `version`.
- Work Area creation automatically issues the initial active QR.
- Exactly one ACTIVE QR per Work Area is enforced by a partial unique index.
- Reprint is read-only and preserves the same QR identity.
- Regenerate locks the Work Area/current QR, revokes the old QR, issues a new token, and is idempotent.
- Public QR token is a random 192-bit bearer token separate from internal UUIDs.
- QR does not grant application authorization.
- Public resolver returns only Organization, Site, Work Area, description/location, and service status.
- Private notes, worker contact information, audit, membership, and evidence are not exposed.
- Creation, QR issue/regeneration, and status changes are audited.
- Demo parity illustrates all behaviors without tenant writes.

The physical QR points to `/q/<public-token>` and can later be consumed by the mobile scanner as an entry identity. Server-side mobile validation remains a future execution-layer responsibility.

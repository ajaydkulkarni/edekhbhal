# Authentication + Guided Onboarding Foundation 01

Validated target flow:

`Supabase Auth → User details → Organization → Plan / activation → First Site → Workspace`

This increment adds:

- Supabase email/password registration and sign-in
- magic-link sign-in
- PKCE callback exchange
- Next.js request-boundary session refresh
- server-authoritative auth subject context
- App User profile synchronization
- narrow SECURITY DEFINER onboarding functions
- immutable first Organization bootstrap with ADMIN membership
- provider-neutral plan catalog and Organization subscription/grant
- Free Beta activation; paid activation deliberately requires a future billing adapter
- first Site creation
- RLS and FORCE RLS for tenant subscription and Site
- onboarding audit evidence
- workspace gate
- public synthetic Demo parity
- integration, module, and E2E coverage

Paid Stripe activation is intentionally not implemented in this increment; the schema and plan catalog are provider-neutral and ready for the adapter.

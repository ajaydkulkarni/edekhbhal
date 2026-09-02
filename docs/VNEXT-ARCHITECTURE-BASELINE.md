# vNext Architecture Baseline

This repository is a clean-slate rebuild. The legacy implementation is a behavioral reference only.

## Locked decisions

- Canonical hierarchy: Organization → Site → Work Area.
- Customer roles: ADMIN, SITE_MANAGER, USER.
- One global User may belong to multiple Organizations with different roles.
- Tenant Organization is explicit per request/transaction.
- PostgreSQL RLS is a database invariant.
- Execution timestamps are server-authoritative UTC.
- Local schedule intent preserves IANA timezone semantics.
- Open work is default; specific Occurrence assignment is optional.
- My Work and Work Area QR are equal entry paths into eligible execution.
- Previous/Next navigates tasks without changing task state.
- Audit format: Date/Time | User | IP Address | Module | Action | Old Value | New Value.
- Demo Workspace is synthetic, not a shared tenant.
- Registration path: User details → Organization → Plan → payment/free activation → first Site → workspace.
- Stripe activates first; Razorpay/India follows behind the same billing gateway.
- No legacy data migration; deterministic seed data will be created.
- The legacy Supabase and Vercel deployments remain untouched until vNext validation/cutover.

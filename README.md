# vNext

Clean-slate rebuild of the operations platform.

## Architectural baseline

- Product-name neutral
- Next.js + TypeScript
- Drizzle + PostgreSQL/Supabase
- Supabase Auth
- RLS from the first tenant table
- Uniform append-only Audit
- Explicit Organization context per request/transaction
- Multi-Organization User support
- UTC execution timestamps + IANA scheduling intent
- Demo parity
- Provider-neutral Billing/Entitlements
- Stripe first; Razorpay later
- Unit, module, integration, RLS, change-of-value, concurrency, E2E and load testing

See `docs/VNEXT-ARCHITECTURE-BASELINE.md`.

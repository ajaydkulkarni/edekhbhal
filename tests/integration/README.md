# Integration tests

Database/RLS integration tests will be enabled immediately after the new vNext Supabase project is created.

They will use `TEST_DATABASE_URL` and will cover:
- tenant context;
- RLS positive/negative cases;
- multi-Organization membership;
- audit/value-change behavior;
- claim/assignment concurrency;
- migration and seed validation.

No integration test should point at the legacy database.

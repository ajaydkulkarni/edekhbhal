# Database Foundation 01

This increment establishes the first production-style RLS boundary for vNext.

## Scope

- Organization
- global App User
- Organization Membership
- Audit Event
- Outbox Event
- immutable Organization name
- transaction-local user / Organization / membership context
- SECURITY DEFINER membership-context helper
- FORCE RLS
- explicit runtime grants
- deterministic multi-Organization test data
- positive and negative RLS integration tests
- concurrent-context isolation test
- Audit append-only test

The same global User is intentionally seeded into two Organizations with different roles to validate multi-Organization switching.

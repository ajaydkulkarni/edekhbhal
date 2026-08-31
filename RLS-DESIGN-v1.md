# eDekhbhal RLS Design v1

**Status:** Design only — do not enable RLS yet  
**Branch:** `v2-rebuild`  
**Prerequisite:** Application-layer authorization regression green (33/33)

## 1. Objective

Add PostgreSQL Row Level Security as a defense-in-depth layer without breaking the existing Next.js + Prisma authorization model.

The existing application remains responsible for business authorization:

- ADMIN: organization-wide access.
- PROPERTY_MANAGER: assignment-scoped access where applicable.
- USER: assignment/execution-scoped access where applicable.

RLS must reinforce these boundaries, not replace the application layer.

## 2. Critical current-state constraint

The application currently uses a shared Prisma client:

```ts
export const prisma = globalThis.prisma ?? new PrismaClient();
```

There is no per-request PostgreSQL identity or tenant context.

Therefore, simply enabling RLS is unsafe:

1. If the runtime DB role has `BYPASSRLS`, policies will not protect Prisma queries.
2. If the runtime DB role does not bypass RLS but no request context is supplied, normal application queries will fail or return no rows.
3. Connection pooling means session-scoped variables must never be allowed to leak between requests.

## 3. Target database roles

Use separate PostgreSQL roles.

### `edekhbhal_migrator`

Purpose:

- Prisma migrations
- schema changes
- controlled administrative maintenance

Properties:

- may own schema objects
- may use `BYPASSRLS`
- must never be used as the normal web/mobile runtime `DATABASE_URL`

### `edekhbhal_app`

Purpose:

- Next.js API/runtime Prisma queries

Properties:

- LOGIN
- NO SUPERUSER
- NO BYPASSRLS
- only required object privileges
- RLS policies apply

### Optional `edekhbhal_service`

Purpose:

- tightly controlled jobs that legitimately need organization-independent processing, such as occurrence generation or maintenance

Prefer explicit service procedures or service-context transactions instead of broad permanent `BYPASSRLS` wherever practical.

## 4. Request-scoped PostgreSQL context

Because eDekhbhal uses application-managed authentication rather than Supabase Auth, RLS policies should not depend on `auth.uid()`.

Use transaction-local PostgreSQL settings:

- `app.user_id`
- `app.organization_id`
- `app.membership_id`
- `app.role`

Example concept:

```sql
select set_config('app.user_id',        '<user-id>', true);
select set_config('app.organization_id','<org-id>', true);
select set_config('app.membership_id',  '<membership-id>', true);
select set_config('app.role',           '<role>', true);
```

The final `true` makes each setting transaction-local.

All tenant-sensitive Prisma operations must execute inside the same transaction that establishes this context.

Never use persistent/session-level `SET` on a pooled connection.

## 5. Application wrapper

Introduce a helper such as:

```ts
withTenantDbContext({ userId, organizationId, membershipId, role }, async (tx) => {
  // all tenant-sensitive Prisma operations use tx
});
```

Conceptual behavior:

1. Start interactive Prisma transaction.
2. Set transaction-local context values.
3. Execute callback using transaction client.
4. Commit/rollback.
5. Context disappears automatically.

Do not enable RLS until tenant-sensitive routes have been migrated to this pattern.

## 6. Database helper functions

Create stable helper functions for policies.

Conceptual functions:

```sql
app_user_id()
app_organization_id()
app_membership_id()
app_membership_role()
app_is_active_member(org_id)
app_can_access_property(property_id)
```

Functions should:

- use `current_setting(..., true)`
- return NULL/false when context is absent
- verify active OrganizationMember rows
- verify property assignments for non-Admin users
- avoid trusting a client-supplied role without validating membership in the database

The database must treat OrganizationMember as authoritative.

## 7. RLS rollout groups

### Group A — direct organization ownership

Best first candidates because tenant ownership is explicit:

- `Organization`
- `OrganizationMember`
- `Property`
- `Task`
- `Schedule`
- `ScheduleOccurrence`
- `ReportedWorkItem`
- `OrganizationEntitlement`
- `Subscription`
- `ContentTranslation`
- `AuditLog` (special handling because `organizationId` is nullable)

Initial policy principle:

```text
row.organizationId = app_organization_id()
AND active membership exists
```

For Property-related reads/actions, assignment restrictions must additionally apply where business rules require them.

### Group B — ownership through parent relationships

These require EXISTS/join-based policies:

- `OrganizationMemberProperty`
- `PersonnelDocument`
- `WorkArea`
- `QrCode`
- `TaskAttachment`
- `ScheduleTask`
- `ScheduleOccurrenceTask`
- `ScheduleOccurrenceNote`
- `ScheduleOccurrenceEvidence`

Examples:

```text
WorkArea
  -> Property.organizationId

ScheduleTask
  -> Schedule.organizationId

ScheduleOccurrenceTask
  -> ScheduleOccurrence.organizationId
```

These should be enabled only after Group A policies and the runtime context wrapper are proven.

### Group C — global/authentication tables

Do not put ordinary tenant RLS on these in the first rollout:

- `User`
- `Session`
- `MagicLinkToken`
- `Plan`

Authentication must be able to resolve a session before an Organization context exists.

Access to these tables should instead be protected by database grants and server-only credentials.

## 8. Property assignment logic

Database-level property access must match the existing application rule:

### ADMIN

Active Admin membership in the current Organization:

```text
all Properties in that Organization
```

### PROPERTY_MANAGER / USER

Require an active assignment in `OrganizationMemberProperty`.

Conceptually:

```sql
exists (
  select 1
  from "OrganizationMemberProperty" omp
  where omp."organizationMemberId" = app_membership_id()
    and omp."propertyId" = target_property_id
)
```

The helper must also verify that the membership belongs to `app_organization_id()` and is ACTIVE.

## 9. Write policies

RLS policies must use both:

- `USING (...)`
- `WITH CHECK (...)`

This prevents a permitted row from being updated so that it moves into another Organization/Property boundary.

Application role rules still apply:

- Organization configuration: Admin only.
- Property master write: Admin only.
- Work Area/Task/Schedule writes: according to current application decisions.
- User-facing execution writes: only assigned/claim-authorized work.

Do not rely on RLS alone for semantic workflow rules.

## 10. Public QR exception

The public Work Area QR route intentionally works without a user session.

Do not create a broad anonymous table policy.

Preferred options, in order:

1. A narrowly scoped `SECURITY DEFINER` database function that accepts the public QR record identifier and returns only approved public fields.
2. A dedicated server-side public-read database role/function with minimal privileges.
3. Temporary controlled service context if the first two are impractical.

The public QR path must never gain general tenant-table read access.

## 11. E2E endpoint exception

`/api/e2e/*` is already gated by:

- `E2E_TESTING_ENABLED`
- allowed application URL
- `E2E_TEST_SECRET`
- explicit E2E identities

Fixture setup requires cross-organization administrative database access.

When RLS is introduced, fixture setup should use a deliberately privileged test-only database path or service role, never the ordinary `edekhbhal_app` runtime context.

Production must retain the existing E2E gates.

## 12. Cron/background processing

Background occurrence generation cannot depend on a browser session.

Before RLS activation, identify every cron/background process and choose one of:

- iterate Organizations and establish explicit organization service context per transaction, or
- execute a narrowly scoped privileged stored procedure.

Avoid unrestricted application-wide bypass for ordinary requests.

## 13. Deployment sequence

### Phase 0 — completed

- Existing role/property authorization tests green.
- Cross-tenant isolation tests green.
- Full suite: 33/33.

### Phase 1 — runtime foundation

1. Create non-BYPASSRLS application role.
2. Keep current runtime unchanged.
3. Add `withTenantDbContext`.
4. Add DB context helper functions.
5. Add tests for context isolation/leakage.
6. No table RLS enabled yet.

### Phase 2 — Group A RLS in staging

1. Enable RLS on direct organization-owned tables.
2. Add policies.
3. Run SQL allow/deny tests.
4. Run Playwright regression.
5. Resolve every failure before continuing.

### Phase 3 — Group B RLS

Enable parent-derived policies table-by-table.

Run regression after each small group.

### Phase 4 — public/service paths

Harden:

- public QR
- cron
- E2E fixture setup
- any future billing/service jobs

### Phase 5 — production readiness

Required gates:

- full Playwright suite green
- explicit RLS negative tests green
- no production runtime role has `BYPASSRLS`
- connection-context leakage test green
- public QR regression green
- cron regression green
- documented rollback SQL available

## 14. Rollback requirement

Every RLS migration must include documented rollback statements.

Example:

```sql
alter table "Property" disable row level security;
drop policy if exists ... on "Property";
```

Do not remove application-level authorization when RLS is introduced.

## 15. Immediate next implementation batch

Build **RLS Runtime Foundation 01** only:

1. Add database context helper SQL/functions.
2. Add TypeScript `withTenantDbContext` abstraction.
3. Add an E2E/test-only diagnostic endpoint that proves:
   - context is visible inside the transaction,
   - absent outside the transaction,
   - one request's context cannot leak into the next pooled request.
4. Do NOT enable RLS on business tables yet.
5. Full regression target remains 33/33 plus new context tests.

Only after that batch is green should Group A policies be created.

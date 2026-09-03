# vNext Project Context & Continuity Notes

> **Purpose**
>
> This is the vNext continuity document for the clean-slate rebuild. It records the current validated baseline, locked architecture, security posture, implemented onboarding flow, test state, Demo parity rules, and immediate next development target.
>
> **Development rule:** Before every future code change, first read the latest `PROJECT-CONTEXT.md` from `v2-rebuild`, then inspect the current `vNext` implementation. The legacy branch remains a behavioral reference; vNext architecture takes precedence where the clean-slate design deliberately differs.

**Last updated:** 2026-09-03
**Primary rebuild branch:** `vNext`
**Latest validated vNext baseline:** `41af015` — `Harden Work Area QR authorization and idempotency`
**Work Area + QR functional baseline:** `3c360af` — `Add Work Area and QR lifecycle foundation`
**Previous validated functional baseline:** `b99b38f` — `Add vNext authentication and guided onboarding foundation`
**Validated database foundation:** `0109eb5` — `Establish vNext RLS database foundation`
**Legacy behavioral reference branch:** `v2-rebuild`
**Legacy validated Web/API E2E:** 46/46 PASS
**Legacy Demo focused E2E:** 10/10 PASS

---

## 1. Canonical Development Workflow

For every future vNext development increment:

1. Read the latest `PROJECT-CONTEXT.md` from `v2-rebuild` first.
2. Inspect the latest relevant `vNext` source and migration files.
3. Preserve locked vNext architecture and business rules.
4. Apply every applicable real Organization Workspace feature to the Demo Workspace automatically.
5. Add or update automated regression coverage.
6. Validate database migration behavior, RLS, typecheck, tests, lint, production build, and relevant E2E.
7. Do not weaken a failing security test merely to make a build pass.
8. Update this vNext continuity document after a validated baseline.
9. Do not require the product owner to manually edit source files; provide complete files or guarded APPLY scripts.

---

## 2. Product & Naming Direction

vNext is a clean-slate, product-name-neutral multi-tenant SaaS platform.

The durable technical hierarchy is:

`Organization → Site → Work Area`

Canonical technical names:

- `Organization`
- `Site`
- `Work Area`
- `SITE_MANAGER`

Do not embed the temporary product name in durable schema names, APIs, storage keys, feature codes, Demo identifiers, or RLS logic. Branding is centralized and replaceable.

The legacy `Property` terminology is a behavioral reference only. vNext uses `Site`.

---

## 3. Locked Customer Roles

Exactly three customer roles:

- `ADMIN`
- `SITE_MANAGER`
- `USER`

A single global User may belong to multiple Organizations with different roles.

Authorization order:

`Authenticated → Active membership → Role → Site/resource scope → Entitlement → Domain invariant → RLS`

Authorization and commercial entitlement remain separate concerns.

---

## 4. Multi-Tenant Database Security

### Runtime and migrator separation

The vNext Supabase/PostgreSQL project uses separate database roles:

- `vnext_migrator`
  - migration/schema role
  - privileged only as required for schema lifecycle
  - not used by runtime requests
- `vnext_runtime`
  - no superuser
  - no `BYPASSRLS`
  - no database CREATE privilege
  - explicit least-privilege table/function grants only

Runtime PostgreSQL connections use the transaction pooler with prepared statements disabled.

### Transaction-local tenant context

Tenant execution context is transaction-local, never session-global:

- `app.user_id`
- `app.organization_id`
- `app.membership_id`

Authentication bootstrap additionally uses transaction-local:

- `app.auth_subject`

This design supports concurrent requests and multiple browser tabs operating in different Organizations without context leakage.

### RLS

RLS is treated as a database invariant in vNext.

Core tenant tables have `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`.

The Database Foundation regression suite verifies:

- Organization isolation
- same User in different Organizations
- mismatched membership/Organization fail-closed behavior
- transaction-local context clearing after commit
- concurrent context isolation
- ADMIN vs USER visibility/update rules
- immutable Organization name
- exact audit actor-context enforcement
- append-only Audit runtime behavior

Broad default runtime table privileges were explicitly removed after a security regression exposed inherited `DELETE` permission on `audit_event`.

Future tables must remain fail-closed by default.

---

## 5. Validated Database Foundation 01

Validated commit:

`0109eb5 Establish vNext RLS database foundation`

Core tables:

- `organization`
- `app_user`
- `organization_membership`
- `audit_event`
- `outbox_event`

Locked rules:

- Organization name is immutable after creation.
- Normal business lifecycle is soft/inactive, not destructive deletion.
- Audit is append-only for runtime.
- Outbox is transactional infrastructure, not an application read model.
- Every tenant-owned future table must include explicit `organization_id`.

Deterministic seed data proves one User can have distinct memberships and roles in separate Organizations.

---

## 6. Authentication Foundation

Validated functional commit:

`b99b38f Add vNext authentication and guided onboarding foundation`

Authentication uses Supabase Auth.

Implemented application paths:

- Email + password registration
- Email + password sign-in
- Magic-link sign-in
- PKCE/auth callback exchange at `/auth/callback`
- Supabase server/client helpers
- request-boundary session refresh through Next.js proxy middleware
- authenticated workspace gate
- sign-out

The Supabase auth subject is mapped to the product-level `app_user` record through a narrow server-side provisioning function rather than granting unrestricted direct table bootstrap writes.

### Verification scope

The code compiles and production-builds successfully. Public auth screens and Demo onboarding paths are covered by Playwright.

Database onboarding behavior is covered by integration tests.

A real external email confirmation/magic-link round trip against the deployed environment is still a deployment-level verification item; automated tests do not depend on receiving a real email.

---

## 7. Guided Onboarding

Canonical onboarding flow:

`User details → Create Organization → Select Plan → payment/free activation → Create first Site → Workspace`

The state machine includes:

- `REGISTERED`
- `PROFILE_COMPLETED`
- `ORGANIZATION_CREATED`
- `PLAN_SELECTED`
- `BILLING_COMPLETE`
- `FREE_OR_SPONSORED_ACTIVATED`
- `FIRST_SITE_CREATED`
- `ONBOARDING_COMPLETE`

Current implemented routes:

- `/register`
- `/login`
- `/onboarding/profile`
- `/onboarding/organization`
- `/onboarding/plan`
- `/onboarding/site`
- `/workspace`

### Secure first-tenant bootstrap

Direct runtime INSERT privileges are intentionally not broadened for `organization` or `app_user`.

Initial provisioning occurs through narrow `SECURITY DEFINER` functions using the authenticated subject.

Implemented provisioning functions cover:

- current App User upsert
- first Organization bootstrap
- first ADMIN membership creation
- free/sponsored plan activation
- first Site creation
- current onboarding snapshot

The first Organization bootstrap rejects creation of a second initial Organization through the onboarding bootstrap path.

---

## 8. Site Foundation

The first tenant operational child entity is `Site`.

Implemented `site` table includes:

- Organization ownership
- name
- code
- IANA timezone
- address fields
- country
- ACTIVE/INACTIVE lifecycle
- timestamps
- optimistic `version`

RLS + FORCE RLS are enabled.

Current Site authorization is assignment-aware:

- ADMIN retains Organization-wide Site visibility.
- SITE_MANAGER sees only explicitly assigned Sites.
- USER sees only explicitly assigned Sites.
- Site scope is independent of Site ACTIVE/INACTIVE state for historical visibility.
- creation of new Work Areas and QR regeneration require an ACTIVE Site.
- normal multi-Site administration UI remains deferred.

Onboarding creates only the **first Site**. Normal multi-Site administration belongs to the later Site management module.

---

## 9. Work Area + QR Lifecycle Foundation

Validated functional commit:

`3c360af Add Work Area and QR lifecycle foundation`

Implemented hierarchy:

`Organization → Site → Work Area`

Work Area foundation includes:

- explicit `organization_id` and parent `site_id`
- name/code/description/location fields
- ACTIVE/INACTIVE soft lifecycle
- optimistic `version`
- Site-scoped authorization
- RLS + FORCE RLS
- management writes limited to ADMIN and assigned SITE_MANAGER scope
- `site_membership_scope` foundation for assignment-based Site access

QR lifecycle includes:

- one ACTIVE database-backed QR identity per Work Area
- partial unique database constraint enforcing one active QR
- random 48-character public token separate from internal UUIDs
- Reprint preserves the same active QR identity
- Regenerate atomically revokes the old QR and creates a new identity
- old public QR becomes invalid after regeneration
- create/regenerate idempotency records
- row locking/concurrency protection
- safe public resolver at `/q/[token]`
- printable 4×6 Work Area QR label
- QR never grants application authorization

The public resolver intentionally exposes only safe transparency fields:

- Organization name
- Site name
- Work Area name
- Work Area description/location
- service status

It does not expose worker contact details, private notes, audit history, memberships, or private evidence.

Migration `0005_work_area_qr_token_hotfix.sql` replaced the initial `gen_random_bytes` token implementation with two PostgreSQL UUIDv4 values truncated to 48 lowercase hex characters. The base `0004` migration was repaired too, so a clean replay does not reintroduce the defect.

Demo parity includes synthetic Work Area + QR lifecycle behavior and explicitly explains Reprint, Regenerate, public scanning, and the rule that QR identity is not authorization.

### Work Area + QR Hardening 02

Validated hardening commit:

`41af015 Harden Work Area QR authorization and idempotency`

Hardening 02 established:

- assignment-scoped Site visibility for SITE_MANAGER and USER
- Organization-wide Site visibility retained for ADMIN
- historical Site and Work Area reads preserved when an assigned Site becomes INACTIVE
- new Work Area creation blocked when the parent Site is INACTIVE
- QR regeneration blocked when the parent Site is INACTIVE
- USER cannot read command idempotency payloads
- same-key Work Area creation is serialized with transaction-scoped advisory locking
- same-key QR regeneration is serialized with transaction-scoped advisory locking
- concurrent callers using the same idempotency key receive the same operation result
- existing one-active-QR and RLS invariants remain enforced

The hardening migration is `0006_work_area_qr_hardening.sql`.

---

## 10. Billing & Entitlements Foundation

Billing architecture is provider-neutral from day one.

Commercial modes:

- `FREE`
- `SPONSORED`
- `TRIAL`
- `PAID`
- `CUSTOM_CONTRACT`

Subscription statuses include:

- `ACTIVE`
- `PENDING_PAYMENT`
- `GRACE`
- `SUSPENDED`
- `CANCELLED`

Implemented catalog baseline:

- `FREE_BETA`
- `STANDARD`
- `PROFESSIONAL`

`FREE_BETA` activation is currently functional.

Paid activation deliberately fails closed until a billing provider adapter exists.

Stripe is the first planned provider. Razorpay/India follows behind the same billing/entitlement abstraction.

Operational modules must not import provider SDKs directly.

Downgrades must never delete operational history.

Payment failure will use grace/suspension policy rather than destructive deletion.

---

## 11. Audit

Human-readable target format:

`Date/Time Stamp | User | IP Address | Module | Action | Old Value | New Value`

Machine audit records preserve:

- Organization
- actor User
- actor Membership
- actor display-name snapshot
- module/action
- entity type/id
- old/new JSON
- request/correlation IDs
- source
- IP
- reason

Current validated audit coverage includes:

- `ORGANIZATION_CREATED`
- `FREE_PLAN_ACTIVATED`
- `SITE_CREATED`
- `WORK_AREA_CREATED`
- `QR_ISSUED`
- `QR_REGENERATED`
- `WORK_AREA_STATUS_CHANGED`

All future meaningful changes require change-of-value testing where applicable.

---

## 12. Transactional Outbox

`outbox_event` is already part of the core database foundation.

Future cross-system operations such as:

- billing provider synchronization
- emails
- notifications
- media processing
- webhook delivery

must use the transactional outbox instead of making external provider calls inside core business transactions.

The future worker must remain a separate constrained role/mechanism; it must not become a universal `BYPASSRLS` runtime credential.

---

## 13. Demo Workspace Rule

Demo parity is mandatory and automatic.

Every applicable real Organization Workspace feature must have a Demo equivalent without needing a separate request.

Demo is:

- synthetic
- read-only or safely simulated
- educational
- not a shared tenant Organization
- never a path to real billing or destructive operations

Current Demo illustrates:

- User details
- Organization creation
- plan selection
- first Site
- workspace handoff
- synthetic Work Area lifecycle
- QR Reprint vs Regenerate behavior
- safe public QR transparency
- the rule that QR identity never grants authorization

It explicitly explains that real authentication, tenant writes, QR regeneration, billing writes, evidence capture, and destructive actions are unavailable in Demo.

---

## 14. Time Rules

System/execution timestamps:

- PostgreSQL `timestamptz`
- stored/processed in UTC
- server authoritative

Scheduling must preserve local intent using IANA timezone identifiers.

Future Schedule and Occurrence design must snapshot effective timezone context so historical work never shifts after Organization/Site timezone changes.

Mandatory time regression areas include:

- DST gap
- DST overlap
- midnight boundaries
- Jan 31
- Feb 29
- incorrect device clocks
- later government timezone-rule changes

Device time is never authoritative for execution records.

---

## 15. Mobile & Work Execution Rules

Mobile development follows after the Schedule/Occurrence/QR backend becomes stable.

Locked behavior:

### My Work

Server-ranked eligible work:

1. assigned to me
2. overdue
3. due now
4. closest upcoming
5. priority
6. deterministic tie-break

### QR

A User may scan any nearby Work Area QR.

The server validates:

- QR validity
- active membership
- Site scope
- work eligibility
- assignment
- active-work conflict

QR never grants authorization.

### Claim/start

Open work can be claimed by an eligible User without manager approval.

Assigned-to-another-User work cannot be claimed.

Active-work exclusivity is per **Organization Membership**, not globally per User.

Claim/start must use transaction locks/constraints and idempotency.

Previous/Next navigation never changes task state.

---

## 16. Evidence & Storage Rules

Future evidence architecture:

- private object storage
- signed short-lived URLs
- optimized/compressed images
- normalized/transcoded video
- poster/thumbnail generation
- SHA-256 checksum
- no cross-tenant content deduplication
- lifecycle/retention policy
- optional original retention by entitlement

Original video should normally be discarded after normalization unless the applicable plan/retention policy explicitly retains it.

---

## 17. Platform Control Plane

Future platform administration is separate from customer tenant roles.

Planned platform roles:

- `PLATFORM_SUPERADMIN`
- `OPERATIONS`
- `BILLING`
- `SUPPORT`
- `READONLY`

Support access should default to metadata/configuration and read-only View As.

Any deeper support elevation requires:

- reason/ticket
- short lifetime
- attribution
- prominent UI state
- audit
- sensitive-action restrictions

No frontend universal database credential is permitted.

---

## 18. Current Validated Test Baseline

At commit `41af015`, the validated development run was:

### Integration

- Database Foundation RLS tests: **13/13 PASS**
- Auth + Onboarding integration tests: **6/6 PASS**
- Work Area + QR foundation integration tests: **7/7 PASS**
- Work Area + QR Hardening 02 integration tests: **6/6 PASS**
- Total integration: **32/32 PASS**

Hardening 02 specifically verifies:

- Site visibility scoping for ADMIN, SITE_MANAGER, and USER
- historical visibility under an INACTIVE assigned Site
- blocking new Work Areas under an INACTIVE Site
- USER denial from command idempotency payloads
- same-key concurrent Work Area creation
- same-key concurrent QR regeneration

### Full Vitest

- Test files: **10/10 PASS**
- Tests: **46/46 PASS**

### Build gates

- TypeScript: **PASS**
- ESLint: **PASS**
- Next.js production build: **PASS**

Validated routes include:

- `/`
- `/demo`
- `/login`
- `/register`
- `/auth/callback`
- `/onboarding/profile`
- `/onboarding/organization`
- `/onboarding/plan`
- `/onboarding/site`
- `/workspace`
- `/q/[token]`
- `/workspace/work-areas`
- `/workspace/work-areas/[id]/qr`

### Playwright

- Public Auth + Demo onboarding paths: PASS
- Landing primary product paths: PASS
- Demo Work Area + QR lifecycle: PASS
- Total: **3/3 PASS**

---

## 19. Current Technology Baseline

Application:

- Next.js 16.3.4
- React 19.2.8
- TypeScript 6.0.3
- ESLint 9.39.2
- Vitest 4.1.11
- Playwright 1.62.1

Data/Auth:

- Supabase Auth
- PostgreSQL
- Drizzle ORM 0.45.2
- postgres.js 3.4.7
- Supabase JS 2.112.4
- Supabase SSR 0.12.5
- Zod 4.5.4

Runtime PostgreSQL transaction pooling uses `prepare: false`.

---

## 20. Immediate Next Development Target

Next functional increment:

**Task Master Foundation 01**

The increment should establish:

1. Organization-level reusable Task master
2. name and rich task instructions/description
3. ACTIVE/INACTIVE lifecycle
4. ADMIN and permitted SITE_MANAGER management; USER read-only
5. attachment metadata contract prepared for private object storage
6. no Base64 media storage
7. audit old/new values for create/edit/status changes
8. RLS + FORCE RLS
9. optimistic versioning
10. idempotent command boundaries where applicable
11. Demo parity with representative synthetic Tasks
12. deterministic seed/test data
13. unit/module/integration/RLS/change-of-value coverage
14. workspace Task administration UI
15. API/service contracts suitable for later Schedule composition

Do not implement Schedule/Occurrence execution in the Task increment. Task remains a reusable Organization-level master and must not be coupled to a specific Site or Work Area.

---

## 21. Important Deferred Items

Not yet implemented/validated as complete production capabilities:

- Stripe checkout/customer/subscription adapter
- Razorpay adapter
- multi-Site administration UI
- Tasks
- Schedules
- Occurrences
- assignment
- claim/start/complete workflow
- evidence/media pipeline
- reported work
- mobile field application
- platform control plane
- real deployed email/magic-link round-trip verification
- production SLO/load certification

These are planned capabilities, not claims about the current baseline.

---

## 22. Baseline Commit Chain

Key validated vNext commits:

- `0109eb5` — Establish vNext RLS database foundation
- `b99b38f` — Add vNext authentication and guided onboarding foundation
- `3c360af` — Add Work Area and QR lifecycle foundation
- `de64847` — Harden Work Area QR foundation
- `59477e1` — Fix vNext context section numbering
- `41af015` — Harden Work Area QR authorization and idempotency

`41af015` is the current locked vNext baseline for subsequent development. Task Master Foundation 01 remains the immediate next functional increment.


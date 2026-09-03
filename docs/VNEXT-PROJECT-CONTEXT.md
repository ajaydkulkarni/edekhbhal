# vNext Project Context & Continuity Notes

> **Purpose**
>
> Canonical continuity document for the clean-slate `vNext` rebuild. Keep this document concise: preserve locked architecture/business rules, validated baselines, important deferred decisions, and the immediate next increment.
>
> **Development rule:** Before every future code change, first read the latest `PROJECT-CONTEXT.md` from `v2-rebuild`, then inspect the current committed `vNext` implementation. Legacy remains the behavioral reference; deliberate vNext architecture takes precedence.

**Last updated:** 2026-09-03
**Primary rebuild branch:** `vNext`
**Latest validated vNext baseline:** `a6d01d1021d207d10ee5aa55ad9cec730531888c` — `Add Occurrence Foundation`
**Validated database foundation:** `0109eb5`
**Legacy behavioral reference branch:** `v2-rebuild`
**Legacy validated Web/API E2E:** 46/46 PASS
**Legacy Demo focused E2E:** 10/10 PASS

---

## 1. Canonical Development Workflow

For every vNext development increment:

1. Read `v2-rebuild/PROJECT-CONTEXT.md` first.
2. Inspect the latest relevant committed `vNext` source and migrations.
3. Preserve locked vNext architecture and business rules.
4. Apply every applicable Organization Workspace change to Demo automatically.
5. Add/update regression coverage before calling the increment complete.
6. Validate migration/RLS, integration tests, full Vitest, typecheck, lint, production build, and relevant E2E.
7. Do not weaken a failing security test merely to make a build pass.
8. Commit a stable functional checkpoint before starting a materially separate hardening increment when practical.
9. When an unexpected failure appears, collect the exact affected local source/diagnostics before generating a patch.
10. Update this document only after a validated baseline.
11. Never require the product owner to manually edit source files; provide complete files or guarded APPLY packages.
12. Codespaces command blocks given to the product owner must begin with `git pull origin vNext`.

Installer guards must use ancestry validation rather than exact HEAD because upload-only GitHub commits may sit harmlessly above a validated baseline.

---

## 2. Product & Naming Direction

vNext is a product-name-neutral multi-tenant SaaS platform.

Durable hierarchy:

`Organization → Site → Work Area`

Canonical customer roles:

- `ADMIN`
- `SITE_MANAGER`
- `USER`

The legacy `Property` concept maps to vNext `Site`.

Do not embed the temporary product name in durable schema names, APIs, storage keys, feature codes, Demo identifiers, or RLS logic. Branding remains centralized and replaceable.

---

## 3. Locked Authorization & Tenant Rules

A global User may belong to multiple Organizations with different memberships/roles.

Authorization order:

`Authenticated → Active membership → Role → Site/resource scope → Entitlement → Domain invariant → RLS`

Per request/transaction tenant context only:

- `app.user_id`
- `app.organization_id`
- `app.membership_id`

Authentication bootstrap additionally uses:

- `app.auth_subject`

Never use session-global tenant state.

Open work may be claimed by an eligible USER without manager approval. Assigned-to-another-user work cannot be claimed.

Active-work exclusivity is per **Organization Membership**, not globally per User.

QR never grants authorization. The server must independently validate membership, Site/resource scope, work eligibility, assignment, and active-work conflict.

---

## 4. Multi-Tenant Database Security

Database roles:

- `vnext_migrator`
  - schema/migration role
  - privileged only as needed
  - never runtime
- `vnext_runtime`
  - no superuser
  - no `BYPASSRLS`
  - no database CREATE privilege
  - least-privilege grants only

Runtime PostgreSQL pooling uses `prepare: false`.

Tenant-owned tables use explicit `organization_id`, `ENABLE ROW LEVEL SECURITY`, and `FORCE ROW LEVEL SECURITY`.

Runtime must fail closed without valid transaction-local context.

Audit is append-only for runtime. Future external side effects use the transactional outbox. A future worker must not become a universal BYPASSRLS credential.

---

## 5. Validated Foundations

### Database Foundation

Commit: `0109eb5` — `Establish vNext RLS database foundation`

Core tenancy/audit/outbox tables and immutable Organization-name rule are validated.

### Auth + Guided Onboarding

Commit: `b99b38f` — `Add vNext authentication and guided onboarding foundation`

Implemented:

- Supabase Auth
- email/password
- magic link + PKCE callback
- authenticated workspace gate/sign-out
- app-user provisioning
- first Organization + ADMIN membership bootstrap
- plan selection/free activation
- first Site creation

Canonical onboarding:

`User details → Create Organization → Select Plan → payment/free activation → Create first Site → Workspace`

Paid activation fails closed until a billing provider adapter exists.

### Site Foundation

`Site` includes Organization ownership, name/code, IANA timezone, address/country, ACTIVE/INACTIVE status, timestamps, and optimistic version.

Visibility:

- ADMIN: Organization-wide
- SITE_MANAGER: explicitly assigned Sites
- USER: explicitly assigned Sites

Historical Site visibility survives inactivation; new operational creation requires ACTIVE parent resources.

---

## 6. Work Area + QR Lifecycle

Functional commit: `3c360af`
Hardening commits: `de64847`, `41af015`

Work Area includes explicit Organization + Site ownership, name/code/description/location, ACTIVE/INACTIVE lifecycle, optimistic version, assignment-scoped authorization, RLS + FORCE RLS.

QR lifecycle:

- one ACTIVE database-backed QR identity per Work Area
- random public token separate from internal UUID
- Reprint preserves active identity
- Regenerate atomically revokes old QR and creates a new identity
- old QR becomes invalid
- idempotency + advisory locking
- safe public `/q/[token]`
- printable 4×6 label
- QR identity never grants authorization

Public QR transparency may expose safe Organization/Site/Work Area/service information only. Never expose private notes, audit, memberships, worker contact, or private evidence.

Working-hours inheritance is now implemented by Occurrence Foundation:

`Work Area override → Site override → Organization default`

`null` at Site/Work Area means inherit.

Current Organization default is explicit 24×7 unless configured otherwise.

Deferred Work Area UI items:

- working-hours management UI
- Work Area details edit UI
- Site assignment management UI/API
- QR reprint audit event

---

## 7. Task Master Foundation

Functional commit: `a6e8072`
Command-boundary hardening included in `c832ce1`

Tasks remain reusable **Organization-level** masters, not Site/Work-Area-owned.

Implemented:

- explicit `organization_id`
- name + rich HTML instruction source
- ACTIVE/INACTIVE lifecycle
- optimistic version
- RLS + FORCE RLS
- ADMIN management
- SITE_MANAGER management under current Organization-level rule
- USER read-only visibility
- idempotent create
- audited create/edit/status commands
- attachment metadata contract for private object storage
- no Base64/blob content in PostgreSQL
- `/workspace/tasks`
- Demo Task parity

Current SITE_MANAGER rule: Task management is permitted when the membership has at least one Site scope in the Organization. There is no Task→Site ownership relation. Do not silently redesign Tasks as Site-scoped.

Occurrence Foundation closed the deferred tenant-safe composite attachment FK:

`task_attachment(organization_id, task_id) → task_master(organization_id, id)`

Still deferred:

- actual attachment upload/signing/media processing
- rich-HTML sanitizer for future rendering surfaces

---

## 8. Schedule Master Foundation 01

Validated baseline: `c832ce1d5118b00db32f14cf7991c2479d279945`

Migrations:

- `0008_schedule_master_foundation.sql`
- `0009_task_schedule_command_boundary_hardening.sql`

Schedule is the reusable planning layer; execution happens against generated Occurrences.

Implemented:

- one Work Area per Schedule
- one or more ordered ACTIVE Tasks
- ONE_TIME / RECURRING
- MINUTE / HOUR / DAY / WEEK / MONTH / YEAR
- optional recurring end date inclusive by Schedule-local calendar date
- local start date/time
- Site IANA timezone snapshot
- controlled-document reference/revision
- ACTIVE/INACTIVE lifecycle
- optimistic version
- idempotent create
- audited create/update/status
- RLS + FORCE RLS
- ADMIN/SITE_MANAGER Site-scoped management
- USER read-only
- historical reads after parent inactivation
- unsafe create/edit/reactivation blocked
- ordered Task duration offsets
- evidence rules NONE / PHOTO / VIDEO / RANDOM
- deterministic RANDOM 1-in-N configuration

Schedule create/edit/status actions now reconcile the normal **48-hour** occurrence horizon.

Runtime direct DML remains revoked from Task/Schedule command-owned tables.

---

## 9. Occurrence Foundation 01

Validated commit:

`a6d01d1021d207d10ee5aa55ad9cec730531888c` — `Add Occurrence Foundation`

Migrations:

- `0010_occurrence_foundation.sql`
- `0011_occurrence_id_ambiguity_hotfix.sql`
- `0012_working_hours_validator_privilege_hotfix.sql`

`0011` and `0012` are already applied to the active vNext database. Do not reapply `0010`, `0011`, or `0012`.

Execution planning model:

`Schedule → Schedule Occurrence → Schedule Occurrence Task`

Implemented Occurrence snapshot data includes:

- explicit Organization / Site / Work Area / Schedule references
- uniqueness by Schedule + scheduled UTC start
- `scheduled_start_utc` / `scheduled_end_utc` as server-authoritative `timestamptz`
- timezone snapshot
- local date snapshot
- local time snapshot
- UTC offset snapshot
- Organization/Site/Work Area/Schedule display snapshots
- Work Area description/location snapshots
- Schedule version snapshot
- Document/SOP Reference + Revision snapshots
- total planned duration
- effective working-hours JSON + source snapshot
- `supersede_unstarted` snapshot
- status/version/timestamps needed for later execution

Occurrence Task snapshots include:

- Task identity
- Task name
- Task instruction source
- sequence
- planned duration/start/end offsets
- evidence rule/config
- deterministic evidence-required decision at generation
- task execution status/timestamp fields prepared for later execution

### Effective working hours

Implemented inheritance:

`Work Area override → Site override → Organization default`

Working-hours JSON is validated by database CHECK constraints.

Organization receives a validated explicit 24×7 default unless changed by future management UI/configuration.

A Schedule occurrence is generated only when its entire planned local wall-clock span fits the effective open window.

### Time/DST behavior

Generation is local-intent-driven and produces concrete UTC instants.

Validated behavior:

- nonexistent DST-gap local times are skipped rather than silently shifted
- ambiguous DST-overlap local times use PostgreSQL canonical timezone resolution
- selected UTC offset is snapshotted
- historical Occurrence timestamps never shift later
- Jan 31 and Feb 29 Schedule behavior remains covered
- device clock is never authoritative

### Reconciliation

- correctness-first bounded generator
- maximum requested horizon currently 7 days
- normal Schedule action hook reconciles 48 hours
- future unstarted PENDING rows may reconcile
- IN_PROGRESS/completed/history are not rewritten
- stale unstarted PENDING rows are soft-canceled with reconciliation reason
- unique constraints + command boundary provide idempotency/concurrency groundwork
- runtime receives SELECT on Occurrence tables, not direct DML
- reconciliation writes cross a constrained SECURITY DEFINER command
- Site/resource visibility remains RLS scoped

### UI / Demo

Implemented:

- `/workspace/occurrences`
- Workspace Occurrence metric/navigation
- read-only generated planning view
- Demo Occurrence parity explaining snapshots, DST, working-hours enforcement, and execution boundary

Full claim/start/evidence/mobile execution is intentionally not part of Occurrence Foundation 01.

---

## 10. Audit & Outbox

Human-readable audit target:

`Date/Time Stamp | User | IP Address | Module | Action | Old Value | New Value`

Machine audit preserves Organization, actor User/Membership, actor-name snapshot, module/action, entity, old/new JSON, source, correlation/request metadata, IP, and reason where applicable.

Validated operational audit actions include Organization/onboarding, Work Area/QR, Task, and Schedule mutations.

Future assignment/claim/start/complete/supersession actions must also be audited.

---

## 11. Demo Workspace Rule — Mandatory

Every applicable real Organization Workspace addition/change automatically receives a Demo equivalent.

Demo is synthetic, read-only or safely simulated, educational, and never a path to real tenant writes, billing, destructive operations, evidence capture, or mobile execution.

Current Demo illustrates onboarding, Work Area/QR lifecycle, Task masters, Schedule composition, recurrence/local-time intent, evidence semantics, and Occurrence snapshot/time/working-hours behavior.

---

## 12. Time Rules

System/execution timestamps:

- PostgreSQL `timestamptz`
- UTC
- server authoritative

Planning preserves local intent using IANA timezone identifiers.

Timezone resolution:

`Organization default → Site override → Schedule snapshot → Occurrence snapshot`

Historical values never shift after later timezone changes.

Mandatory continuing time regression areas:

- DST gaps
- DST overlaps
- midnight boundaries
- Jan 31
- Feb 29
- wrong device clock
- Organization/Site timezone changes after generation
- timezone-rule changes after generation

---

## 13. Mobile & Work Execution Rules

Mobile implementation follows after Schedule/Occurrence/QR backend execution contracts stabilize.

Server-ranked My Work order:

1. assigned to me
2. overdue
3. due now
4. closest upcoming
5. priority
6. deterministic tie-break

A USER may scan any nearby Work Area QR, but the server must independently validate:

- QR validity
- active membership
- Site scope
- work eligibility
- assignment
- active-work conflict

Claim/start must use transaction locking/constraints and idempotency.

Previous/Next navigation must never change Task state.

---

## 14. Evidence & Storage Rules

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

Original media is discarded after normalization unless policy/entitlement explicitly retains it.

---

## 15. Billing & Platform Control Plane

Billing remains provider-neutral.

Commercial modes include FREE/SPONSORED/TRIAL/PAID/CUSTOM_CONTRACT. Current catalog includes FREE_BETA/STANDARD/PROFESSIONAL.

FREE_BETA activation is functional. Paid activation fails closed until an adapter exists. Stripe is planned first; Razorpay later behind the same abstraction.

Platform administration is separate from customer tenant roles. No frontend universal database credential is permitted.

---

## 16. Current Validated Test Baseline

At commit `a6d01d1021d207d10ee5aa55ad9cec730531888c`:

### Integration

- Database Foundation RLS: **13/13 PASS**
- Auth + Onboarding: **6/6 PASS**
- Work Area + QR foundation: **7/7 PASS**
- Work Area + QR hardening: **6/6 PASS**
- Task Master Foundation: **8/8 PASS**
- Schedule Master Foundation: **8/8 PASS**
- Task/Schedule command-boundary hardening: **3/3 PASS**
- Occurrence Foundation: **5/5 PASS**
- Total integration: **56/56 PASS**

### Full Vitest

- Test files: **21/21 PASS**
- Tests: **89/89 PASS**

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
- onboarding routes
- `/workspace`
- `/workspace/tasks`
- `/workspace/schedules`
- `/workspace/occurrences`
- `/workspace/work-areas`
- `/workspace/work-areas/[id]/qr`
- `/q/[token]`

### Playwright

- **3/3 PASS**
- Demo regression includes Work Area QR + Task + Schedule + Occurrence behavior

---

## 17. Current Technology Baseline

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

---

## 18. Immediate Next Development Target

Next functional increment:

**Occurrence Execution & Supersession Foundation 01**

Before implementation, re-read the legacy My Work / claim / QR-start / latest-due-wins behavior and inspect the committed Occurrence/QR/membership/RLS contracts.

Target backend contracts:

- server-ranked My Work query
- open-work claim by eligible USER without manager approval
- optional pre-assignment compatibility
- transaction-safe claim using row locking + idempotency
- active-work exclusivity per Organization Membership
- assignment/scope validation
- server-authoritative start
- QR validation as a location/resource check, never authorization
- Schedule/Occurrence/Work Area compatibility validation at start
- “latest due occurrence wins” supersession for `supersede_unstarted=true`
- older unstarted PENDING may become MISSED
- claimed-but-unstarted may be released and MISSED when superseded
- corresponding Occurrence Tasks become MISSED
- IN_PROGRESS/completed/history never rewritten
- miss reason/time snapshots
- audit events for claim/release/start/supersession
- deterministic idempotency + concurrency tests
- Demo parity
- API/service contracts suitable for the future mobile app

Do not yet implement media upload/evidence processing or full mobile UI unless explicitly expanded.

A rolling background reconciler/worker may be introduced with this increment or as a separate hardening increment, but it must preserve the validated 48-hour generation semantics and must not use a universal BYPASSRLS credential.

---

## 19. Important Deferred Items

Not yet production-complete:

- working-hours management UI
- multi-Site administration UI
- Site assignment management UI/API
- Occurrence assignment/claim/start/complete workflow
- smart supersession execution
- rolling background generation worker
- evidence/media pipeline
- reported work
- mobile field application
- Stripe adapter
- Razorpay adapter
- platform control plane
- deployed email/magic-link round-trip verification
- production SLO/load certification
- Task HTML sanitizer

---

## 20. Baseline Commit Chain

Key validated vNext commits:

- `0109eb5` — Establish vNext RLS database foundation
- `b99b38f` — Add vNext authentication and guided onboarding foundation
- `3c360af` — Add Work Area and QR lifecycle foundation
- `de64847` — Harden Work Area QR foundation
- `41af015` — Harden Work Area QR authorization and idempotency
- `a6e8072` — Add Task Master foundation
- `c832ce1` — Add Schedule Master and harden Task Schedule command boundary
- `d61a105` — Update vNext context after Schedule hardening
- `a6d01d1` — Add Occurrence Foundation

`a6d01d1021d207d10ee5aa55ad9cec730531888c` is the current locked validated vNext functional baseline.

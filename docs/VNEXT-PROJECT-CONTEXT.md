# vNext Project Context & Continuity Notes

> **Purpose**
>
> Canonical continuity document for the clean-slate `vNext` rebuild. Keep this document concise: preserve locked architecture/business rules, validated baselines, important deferred decisions, and the immediate next increment. Do not accumulate temporary hotfix history here.
>
> **Development rule:** Before every future code change, first read the latest `PROJECT-CONTEXT.md` from `v2-rebuild`, then inspect the current committed `vNext` implementation. Legacy remains the behavioral reference; deliberate vNext architecture takes precedence.

**Last updated:** 2026-09-03
**Primary rebuild branch:** `vNext`
**Latest validated vNext baseline:** `c832ce1d5118b00db32f14cf7991c2479d279945` — `Add Schedule Master and harden Task Schedule command boundary`
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
12. Codespaces command blocks given to the product owner should begin with `git pull origin vNext`.

---

## 2. Product & Naming Direction

vNext is a product-name-neutral multi-tenant SaaS platform.

Durable hierarchy:

`Organization → Site → Work Area`

Canonical technical names:

- `Organization`
- `Site`
- `Work Area`
- `SITE_MANAGER`

The legacy `Property` concept maps to vNext `Site`.

Do not embed the temporary product name in durable schema names, APIs, storage keys, feature codes, Demo identifiers, or RLS logic. Branding remains centralized and replaceable.

---

## 3. Locked Customer Roles & Authorization

Exactly three customer roles:

- `ADMIN`
- `SITE_MANAGER`
- `USER`

A global User may belong to multiple Organizations with different memberships/roles.

Authorization order:

`Authenticated → Active membership → Role → Site/resource scope → Entitlement → Domain invariant → RLS`

Authorization and commercial entitlement remain separate concerns.

Open work may be claimed by an eligible USER without manager approval. Assigned-to-another-user work cannot be claimed.

Active-work exclusivity is per **Organization Membership**, not globally per User.

---

## 4. Multi-Tenant Database Security

### Database roles

- `vnext_migrator`
  - migration/schema role
  - privileged only as required for schema lifecycle
  - never used by runtime requests
- `vnext_runtime`
  - no superuser
  - no `BYPASSRLS`
  - no database CREATE privilege
  - explicit least-privilege grants only

Runtime PostgreSQL transaction pooling uses `prepare: false`.

### Transaction-local tenant context

Per request/transaction only:

- `app.user_id`
- `app.organization_id`
- `app.membership_id`

Authentication bootstrap additionally uses:

- `app.auth_subject`

Never use session-global tenant state. Multi-tab requests for different Organizations must remain isolated.

### RLS

Tenant-owned tables use explicit `organization_id`, `ENABLE ROW LEVEL SECURITY`, and `FORCE ROW LEVEL SECURITY` from their first migration.

Runtime must fail closed when context is absent/mismatched.

Audit remains append-only for runtime. Outbox remains transactional infrastructure rather than a customer-facing read model.

---

## 5. Validated Foundations

### Database Foundation

Commit: `0109eb5` — `Establish vNext RLS database foundation`

Core tables:

- `organization`
- `app_user`
- `organization_membership`
- `audit_event`
- `outbox_event`

Locked rules include immutable Organization name, soft lifecycle, exact actor-context audit enforcement, tenant isolation, and transaction-local context isolation.

### Auth + Guided Onboarding

Commit: `b99b38f` — `Add vNext authentication and guided onboarding foundation`

Implemented:

- Supabase Auth
- email/password registration/sign-in
- magic-link sign-in
- PKCE callback
- authenticated workspace gate/sign-out
- secure app-user provisioning
- first Organization + ADMIN membership bootstrap
- plan selection/free activation
- first Site creation

Canonical onboarding:

`User details → Create Organization → Select Plan → payment/free activation → Create first Site → Workspace`

Paid activation still fails closed until a billing provider adapter exists.

### Site Foundation

`Site` includes Organization ownership, name/code, IANA timezone, address/country, ACTIVE/INACTIVE status, timestamps, and optimistic `version`.

Current Site visibility:

- ADMIN: Organization-wide
- SITE_MANAGER: explicitly assigned Sites
- USER: explicitly assigned Sites

Historical Site visibility survives Site inactivation; new Work Area/QR creation requires an ACTIVE Site.

Normal multi-Site administration UI remains deferred.

---

## 6. Work Area + QR Lifecycle

Functional commit: `3c360af`
Hardening commits: `de64847`, `41af015`

Work Area includes:

- explicit Organization + Site ownership
- name/code/description/location
- ACTIVE/INACTIVE lifecycle
- optimistic version
- assignment-scoped authorization
- RLS + FORCE RLS

QR lifecycle:

- one ACTIVE database-backed QR identity per Work Area
- random 48-character public token separate from internal UUID
- Reprint preserves active QR identity
- Regenerate atomically revokes old QR and creates a new identity
- old public QR becomes invalid
- create/regenerate idempotency + advisory locking
- safe public `/q/[token]` resolver
- printable 4×6 label
- QR identity never grants application authorization

Public QR transparency may expose Organization/Site/Work Area name and safe service-status/location/description information only. Never expose private notes, audit, memberships, worker contact, or private evidence.

### Deferred Work Area items

- effective working-hours inheritance/override implementation
- Work Area details edit UI
- Site assignment management UI/API
- QR reprint audit event

Legacy effective working-hours rule to preserve when implemented:

`Work Area override → Site override → Organization default`

`null` at a lower level means inherit.

---

## 7. Task Master Foundation

Functional commit: `a6e8072`
Command-boundary hardening included in `c832ce1`

Tasks are reusable **Organization-level** masters, deliberately not Site/Work-Area-owned.

Implemented:

- explicit `organization_id`
- name + rich HTML instruction source
- ACTIVE/INACTIVE lifecycle
- optimistic version
- RLS + FORCE RLS
- ADMIN management
- SITE_MANAGER management under current `can_manage_tasks()` rule
- USER read-only visibility
- idempotent create
- audited create/edit/status commands
- attachment metadata contract for private object storage
- no Base64/blob content in PostgreSQL
- `/workspace/tasks`
- Demo Task parity

Audit actions:

- `TASK_CREATED`
- `TASK_UPDATED`
- `TASK_STATUS_CHANGED`

### Current Task SITE_MANAGER scope decision

Tasks remain Organization-level. Current `SITE_MANAGER` Task management is allowed when that membership has at least one Site scope in the Organization. There is no Task→Site ownership relation to narrow an individual Task mutation further.

Do **not** silently redesign Tasks as Site-scoped. Revisit this only with an explicit product model decision.

### Deferred Task items

- actual attachment upload/signing/media processing
- rich-HTML sanitizer for future HTML rendering surfaces
- tenant-safe composite attachment FK hardening (`organization_id`, `task_id`) remains a worthwhile database-hardening follow-up

---

## 8. Schedule Master Foundation 01

Validated baseline: `c832ce1d5118b00db32f14cf7991c2479d279945`

Migration:

- `0008_schedule_master_foundation.sql`

Schedule is the reusable **planning layer**. Occurrence generation/execution is deliberately separate.

Implemented Schedule master supports:

- one Work Area per Schedule
- one or more ordered reusable Tasks
- `ONE_TIME` and `RECURRING`
- recurrence units `MINUTE`, `HOUR`, `DAY`, `WEEK`, `MONTH`, `YEAR`
- optional recurring end date inclusive by local Schedule calendar date
- local start date + local start time
- IANA timezone snapshot from Site
- optional controlled-document fields:
  - Document/SOP Reference
  - Revision/Version
- ACTIVE/INACTIVE lifecycle
- optimistic version
- idempotent create
- audited create/update/status changes
- RLS + FORCE RLS
- ADMIN/SITE_MANAGER management constrained by Site scope
- USER read-only access
- historical reads preserved for scoped users when Site becomes inactive
- new create/edit/reactivation blocked when required Site/Work Area is inactive
- only ACTIVE same-Organization Tasks may be selected for new composition

`schedule_task` snapshots planning composition:

- Task ID
- contiguous sequence starting at 1
- planned duration minutes
- cumulative planned start/end offsets
- evidence rule: `NONE`, `PHOTO`, `VIDEO`, `RANDOM`
- RANDOM deterministic subset configuration (`random_every_n`)
- RANDOM media policy (`PHOTO`, `VIDEO`, `EITHER`)

RANDOM means deterministic 1-in-N evidence selection; it does **not** mean randomly choose Photo vs Video each performance.

Schedule UI:

- `/workspace/schedules`
- Workspace navigation/metric integration
- Demo Schedule parity

### Time behavior validated at Schedule-master level

- Site timezone snapshot into Schedule
- DST-gap local intent is preserved as local intent rather than silently device-normalized
- weekly/monthly recurrence validation
- Jan 31
- Feb 29
- inclusive local end date

Device time is never authoritative for execution data.

### Schedule items intentionally deferred to Occurrence/working-hours work

- generation of concrete UTC occurrence timestamps
- DST overlap/gap resolution policy for actual occurrence instants
- effective working-hours fit enforcement
- occurrence snapshots/history
- rolling generation/reconciliation
- assignment/claim/start/complete
- supersession/miss behavior
- mobile execution/evidence

---

## 9. Task + Schedule Command Boundary Hardening 01

Validated baseline: `c832ce1d5118b00db32f14cf7991c2479d279945`

Migration:

- `0009_task_schedule_command_boundary_hardening.sql`

Security objective: runtime may read permitted tenant rows through RLS, but meaningful Task/Schedule writes must cross audited/versioned command functions.

Hardening establishes:

- direct runtime `INSERT/UPDATE` revoked on `task_master`
- direct runtime `INSERT/UPDATE` revoked on `schedule_master`
- direct runtime `INSERT/UPDATE/DELETE` revoked on `schedule_task`
- internal `insert_schedule_tasks(...)` helper no longer executable by runtime
- Task/Schedule command functions execute through constrained `SECURITY DEFINER` boundaries
- update/status command functions explicitly pin master/child mutations to transaction-local `organization_id`
- fixed function `search_path`
- command paths preserve optimistic versioning, audit, role/site checks, and domain invariants
- direct forbidden runtime DML now fails with permission denial rather than relying only on zero-row RLS behavior

This hardening does not weaken RLS; RLS remains the read/fail-closed tenant boundary and an additional defense layer.

---

## 10. Audit & Outbox

Human-readable audit target:

`Date/Time Stamp | User | IP Address | Module | Action | Old Value | New Value`

Machine audit preserves Organization, actor User/Membership, actor-name snapshot, module/action, entity, old/new JSON, source, correlation/request metadata, IP, and reason where applicable.

Current validated operational actions include:

- `ORGANIZATION_CREATED`
- `FREE_PLAN_ACTIVATED`
- `SITE_CREATED`
- `WORK_AREA_CREATED`
- `QR_ISSUED`
- `QR_REGENERATED`
- `WORK_AREA_STATUS_CHANGED`
- `TASK_CREATED`
- `TASK_UPDATED`
- `TASK_STATUS_CHANGED`
- Schedule create/update/status actions introduced by Schedule Foundation

Future external side effects (billing sync, mail, notifications, media processing, webhooks) must use the transactional outbox. A future worker must not become a universal BYPASSRLS credential.

---

## 11. Demo Workspace Rule — Mandatory

Every applicable real Organization Workspace addition/change must automatically receive a Demo equivalent without requiring another request.

Demo is:

- synthetic
- read-only or safely simulated
- educational
- not a shared tenant Organization
- never a path to real billing/destructive writes

Current Demo illustrates onboarding, Work Area/QR lifecycle, reusable Task masters, Task role behavior, Schedule composition, recurrence/local-time intent, evidence-rule semantics, and that Occurrence/claim/QR-start execution remains separate.

Demo excludes real auth tenant writes, billing writes, evidence capture, mobile execution, and destructive operations, but should explain those boundaries rather than silently omit them.

---

## 12. Time Rules

System/execution timestamps:

- PostgreSQL `timestamptz`
- UTC
- server authoritative

Planning preserves local intent using IANA timezone identifiers.

Timezone resolution model:

`Organization default → Site override → Schedule snapshot → Occurrence snapshot`

Historical values never shift after later timezone changes.

Mandatory time regression areas for Occurrence work:

- DST gaps
- DST overlaps
- midnight boundaries
- Jan 31
- Feb 29
- wrong device clock
- Organization/Site timezone changes after generation
- future timezone-rule changes

---

## 13. Mobile & Work Execution Rules

Mobile implementation follows after Schedule/Occurrence/QR backend contracts stabilize.

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

QR never grants authorization.

Claim/start must use transaction locking/constraints and idempotency. Previous/Next navigation must never change task state.

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

Original video should normally be discarded after normalization unless policy/entitlement explicitly retains it.

---

## 15. Billing & Platform Control Plane

Billing architecture remains provider-neutral.

Commercial modes include FREE/SPONSORED/TRIAL/PAID/CUSTOM_CONTRACT. Current plan catalog includes FREE_BETA/STANDARD/PROFESSIONAL.

FREE_BETA activation is functional. Paid activation fails closed until a provider adapter exists. Stripe is planned first; Razorpay follows behind the same abstraction.

Future platform administration is separate from customer tenant roles. No frontend universal database credential is permitted. Support elevation must be attributable, time-limited, reasoned, visible, audited, and restricted.

---

## 16. Current Validated Test Baseline

At commit `c832ce1d5118b00db32f14cf7991c2479d279945`:

### Integration

- Database Foundation RLS: **13/13 PASS**
- Auth + Onboarding: **6/6 PASS**
- Work Area + QR foundation: **7/7 PASS**
- Work Area + QR Hardening 02: **6/6 PASS**
- Task Master Foundation: **8/8 PASS**
- Schedule Master Foundation: **8/8 PASS**
- Task/Schedule command-boundary hardening: **3/3 PASS**
- Total integration: **51/51 PASS**

### Full Vitest

- Test files: **17/17 PASS**
- Tests: **78/78 PASS**

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
- `/workspace/tasks`
- `/workspace/schedules`
- `/workspace/work-areas`
- `/workspace/work-areas/[id]/qr`
- `/q/[token]`

### Playwright

- Public Auth + Demo onboarding: PASS
- Landing primary product paths: PASS
- Demo Work Area + QR + Task + Schedule behavior: PASS
- Total: **3/3 PASS**

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

**Occurrence Foundation 01**

Before implementation, re-read the legacy Occurrence/rolling-generation/supersession behavior and inspect committed vNext Schedule/Task/Work Area/time/security contracts.

Occurrence Foundation should establish the **generated planning snapshot layer**, not full mobile execution.

Required design topics:

- `Schedule → Occurrence → Occurrence Task` snapshot model
- explicit `organization_id`, Site, Work Area, Schedule references
- uniqueness for Schedule + scheduled instant
- server-authoritative UTC planned start/end (`timestamptz`)
- snapshots of timezone/local date/local time/UTC offset
- snapshots of Organization/Site/Work Area/Schedule/Task planning values needed for immutable history
- controlled-document reference/revision snapshots
- deterministic RANDOM evidence decision at generation time
- occurrence/task status model
- RLS + FORCE RLS
- Site/resource visibility
- rolling generation/reconciliation contract (legacy historically used ~48h horizon)
- schedule create/edit reconciliation hooks or service contracts
- preservation of IN_PROGRESS/completed/history against later master edits
- idempotency + concurrency/uniqueness behavior
- supersession groundwork (`supersedeUnstarted=true`, latest due wins) without inventing unsupported execution shortcuts
- Demo parity
- unit/integration/module/change-of-value/time tests

### Important prerequisite to resolve during Occurrence design

Legacy requires a Schedule to fit completely inside effective open working hours before an occurrence is generated. vNext has not yet implemented the Work Area/Site/Organization working-hours inheritance model. Occurrence Foundation must therefore explicitly resolve that dependency rather than silently generating work that violates the legacy rule.

Do not implement full mobile claim/start/evidence workflow in Occurrence Foundation 01 unless the product owner explicitly expands the increment.

---

## 19. Important Deferred Items

Not yet production-complete:

- Stripe checkout/customer/subscription adapter
- Razorpay adapter
- multi-Site administration UI
- effective Organization/Site/Work Area working-hours model
- Occurrences and rolling generation
- assignment
- claim/start/complete workflow
- evidence/media pipeline
- reported work
- mobile field application
- platform control plane
- real deployed email/magic-link round-trip verification
- production SLO/load certification
- Task attachment composite tenant FK hardening
- Task rich-HTML rendering sanitizer

These are planned/deferred capabilities, not claims about the current baseline.

---

## 20. Baseline Commit Chain

Key validated vNext commits:

- `0109eb5` — Establish vNext RLS database foundation
- `b99b38f` — Add vNext authentication and guided onboarding foundation
- `3c360af` — Add Work Area and QR lifecycle foundation
- `de64847` — Harden Work Area QR foundation
- `59477e1` — Fix vNext context section numbering
- `41af015` — Harden Work Area QR authorization and idempotency
- `a6e8072` — Add Task Master foundation
- `c832ce1` — Add Schedule Master and harden Task Schedule command boundary

`c832ce1d5118b00db32f14cf7991c2479d279945` is the current locked validated vNext baseline. Occurrence Foundation 01 is the immediate next functional increment.

# vNext Project Context & Continuity Notes

> **Purpose**
>
> Canonical continuity document for the clean-slate `vNext` rebuild. Keep this document concise: preserve locked architecture/business rules, validated baselines, important deferred decisions, and the immediate next increment.
>
> **Development rule:** Before every future code change, first read the latest `PROJECT-CONTEXT.md` from `v2-rebuild`, then inspect the current committed `vNext` implementation. Legacy remains the behavioral reference; deliberate vNext architecture takes precedence.

**Last updated:** 2026-09-03
**Primary rebuild branch:** `vNext`
**Latest validated vNext baseline:** `c90de368ac8567834d7f3fd735f6dc92c62b9a5c` — `Harden Occurrence Execution security boundary`
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

QR never grants authorization. The server independently validates membership, Site/resource scope, work eligibility, assignment, active-work conflict, and exact active Work Area QR when QR start is required.

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

Working-hours inheritance:

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

Occurrence Foundation closed the tenant-safe composite attachment FK:

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

Schedule create/edit/status actions reconcile the normal **48-hour** occurrence horizon.

Runtime direct DML remains revoked from Task/Schedule command-owned tables.

---

## 9. Occurrence Foundation 01

Validated commit:

`a6d01d1021d207d10ee5aa55ad9cec730531888c` — `Add Occurrence Foundation`

Migrations:

- `0010_occurrence_foundation.sql`
- `0011_occurrence_id_ambiguity_hotfix.sql`
- `0012_working_hours_validator_privilege_hotfix.sql`

Migrations `0010`, `0011`, and `0012` are already applied to the active vNext database. Do not reapply them.

Execution planning model:

`Schedule → Schedule Occurrence → Schedule Occurrence Task`

Implemented:

- explicit Organization / Site / Work Area / Schedule references
- unique Schedule + scheduled UTC start
- server-authoritative UTC start/end snapshots
- timezone/local-date/local-time/UTC-offset snapshots
- Organization/Site/Work Area/Schedule display snapshots
- Work Area description/location snapshots
- Schedule version snapshot
- Document/SOP Reference + Revision snapshots
- total planned duration
- effective working-hours JSON + source snapshot
- `supersede_unstarted` snapshot
- Task identity/name/instruction/sequence/duration/offset/evidence snapshots
- deterministic evidence-required decision at generation
- RLS + FORCE RLS
- runtime SELECT only; no direct runtime occurrence DML
- bounded reconciliation, maximum 7-day requested horizon
- normal application reconciliation horizon 48 hours
- future unstarted PENDING reconciliation only
- IN_PROGRESS/completed/history not rewritten

### Effective working hours

Implemented inheritance:

`Work Area override → Site override → Organization default`

A Schedule occurrence is generated only when its entire planned local wall-clock span fits the effective open window.

### Time/DST

Validated:

- nonexistent DST-gap local times are skipped
- ambiguous overlap uses PostgreSQL canonical timezone resolution
- selected UTC offset is snapshotted
- historical Occurrence timestamps never shift
- Jan 31 / Feb 29 behavior covered
- device clock is never authoritative

### UI / Demo

Implemented:

- `/workspace/occurrences`
- Workspace Occurrence metric/navigation
- read-only generated planning view
- Demo Occurrence parity

---

## 10. Occurrence Execution & Supersession Foundation 01

Validated commit:

`1f5dbf76cad550bf20e56da60033ab8b8a03702e` — `Add Occurrence Execution and Supersession Foundation`

Migration:

- `0013_occurrence_execution_supersession.sql`

Migration `0013` is already applied to the active vNext database. **Do not reapply it.**

Implemented execution boundary:

- `/workspace/my-work`
- USER-only claim/start command boundary
- management roles retain Site-scoped planning/history reads
- USER occurrence reads limited to open executable work or that membership's assigned work
- server-ranked My Work queue
- open work claim without manager approval
- assigned-to-another-user work blocked
- pre-assigned-but-unclaimed compatibility
- idempotent claim
- transaction locking/advisory locking around claim
- one actively claimed or IN_PROGRESS occurrence per Organization Membership
- database unique partial index backs active-work exclusivity
- server-authoritative occurrence start
- exact ACTIVE QR token must match the Occurrence Work Area
- Site, Work Area, and Schedule must remain ACTIVE at start
- QR never supplies authorization
- first pending Occurrence Task moves to IN_PROGRESS on start
- claim/start remain behind SECURITY DEFINER commands
- runtime direct Occurrence/Occurrence Task UPDATE remains revoked

### Latest-due-wins supersession

For Occurrences whose snapshot has `supersede_unstarted=true`:

- latest due PENDING occurrence wins
- older due unstarted PENDING occurrences become MISSED
- older claimed-but-unstarted PENDING occurrence may be released and become MISSED
- corresponding PENDING Occurrence Tasks become MISSED
- `missed_at` and `SUPERSEDED_BY_LATER_DUE` reason are stored
- IN_PROGRESS/completed/partial/missed/canceled history is not rewritten
- supersession executes before My Work reads and before claim/start commands
- internal supersession helper is not runtime executable

### Audit

Validated audit actions:

- `OCCURRENCE_CLAIMED`
- `OCCURRENCE_STARTED`
- `OCCURRENCE_SUPERSEDED`

### Security hardening

Validated at `c90de368ac8567834d7f3fd735f6dc92c62b9a5c`:

- no-context claim/start/supersession fails closed
- cross-Organization execution attempts fail closed
- cross-Site scoped USER claim is denied
- ADMIN/SITE_MANAGER cannot invoke USER claim/start commands
- direct runtime Occurrence/Occurrence Task UPDATE remains denied
- internal execution/supersession helpers remain non-executable by runtime
- assigned-to-another-user claim is denied inside the SECURITY DEFINER boundary
- idempotency-key reuse for a different occurrence is rejected
- concurrent same-occurrence claims deterministically leave one winner
- concurrent different-occurrence claims for one membership preserve active-work exclusivity
- revoked QR and another Work Area QR fail start
- inactive Work Area or Schedule blocks start after claim
- supersession stays within the same enabled Schedule and due unstarted PENDING rows
- `supersede_unstarted=false` remains untouched
- claimed-but-unstarted supersession releases assignment
- IN_PROGRESS work is never released by supersession
- audit Organization/User/Membership attribution is verified
- no follow-up database migration was required; `0013` remains the latest applied migration

### Demo

Demo now illustrates:

- My Work
- open claim
- one active work item per Organization Membership
- QR location validation
- server-authoritative start
- latest-due-wins supersession
- preserved execution history
- fail-closed security behavior for wrong Site, stale QR, cross-tenant work, and conflicting concurrent claims

Demo performs no real claims, scans, tenant writes, evidence capture, or mobile execution.

---

## 11. Audit & Outbox

Human-readable audit target:

`Date/Time Stamp | User | IP Address | Module | Action | Old Value | New Value`

Machine audit preserves Organization, actor User/Membership, actor-name snapshot, module/action, entity, old/new JSON, source, correlation/request metadata, IP, and reason where applicable.

Validated operational audit includes onboarding, Work Area/QR, Task, Schedule, occurrence claim/start, and supersession.

Audit remains append-only for runtime.

---

## 12. Demo Workspace Rule — Mandatory

Every applicable real Organization Workspace addition/change automatically receives a Demo equivalent.

Demo is synthetic, read-only or safely simulated, educational, and never a path to real tenant writes, billing, destructive operations, evidence capture, or mobile execution.

---

## 13. Time Rules

System/execution timestamps:

- PostgreSQL `timestamptz`
- UTC
- server authoritative

Planning preserves local intent using IANA timezone identifiers.

Timezone resolution:

`Organization default → Site override → Schedule snapshot → Occurrence snapshot`

Historical values never shift after later timezone changes.

Continuing regression areas:

- DST gaps
- DST overlaps
- midnight boundaries
- Jan 31
- Feb 29
- wrong device clock
- Organization/Site timezone changes after generation
- timezone-rule changes after generation

---

## 14. Mobile & Work Execution Rules

Mobile implementation follows after Schedule/Occurrence/QR execution contracts stabilize.

Canonical My Work ranking:

1. assigned to me / active assigned work
2. overdue
3. due now
4. closest upcoming
5. priority when introduced
6. deterministic tie-break

A USER may scan a Work Area QR, but the server independently validates:

- QR validity
- active membership
- Site scope
- work eligibility
- assignment
- active-work conflict
- Schedule/Site/Work Area lifecycle compatibility

Claim/start use locking/constraints and idempotency.

Previous/Next navigation must never change Task state.

---

## 15. Evidence & Storage Rules

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

## 16. Billing & Platform Control Plane

Billing remains provider-neutral.

Commercial modes include FREE/SPONSORED/TRIAL/PAID/CUSTOM_CONTRACT. Current catalog includes FREE_BETA/STANDARD/PROFESSIONAL.

FREE_BETA activation is functional. Paid activation fails closed until an adapter exists. Stripe is planned first; Razorpay later behind the same abstraction.

Platform administration is separate from customer tenant roles. No frontend universal database credential is permitted.

---

## 17. Current Validated Test Baseline

At commit `c90de368ac8567834d7f3fd735f6dc92c62b9a5c`:

### Integration

- Database Foundation RLS: **13/13 PASS**
- Auth + Onboarding: **6/6 PASS**
- Work Area + QR foundation: **7/7 PASS**
- Work Area + QR hardening: **6/6 PASS**
- Task Master Foundation: **8/8 PASS**
- Schedule Master Foundation: **8/8 PASS**
- Task/Schedule command-boundary hardening: **3/3 PASS**
- Occurrence Foundation: **5/5 PASS**
- Occurrence Execution & Supersession: **7/7 PASS**
- Occurrence Execution Security Hardening: **12/12 PASS**
- Total integration: **75/75 PASS**

### Full Vitest

- Test files: **25/25 PASS**
- Tests: **116/116 PASS**

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
- `/workspace/my-work`
- `/workspace/tasks`
- `/workspace/schedules`
- `/workspace/occurrences`
- `/workspace/work-areas`
- `/workspace/work-areas/[id]/qr`
- `/q/[token]`

### Playwright

- **3/3 PASS**
- Demo regression covers planning, My Work / claim / QR-start / supersession, and fail-closed execution-security explanation

---

## 18. Current Technology Baseline

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

## 19. Immediate Next Development Target

Next increment:

**Occurrence Task Execution & Completion Foundation 01**

Build on the validated claim/start boundary without weakening its tenant, Site, QR, assignment, idempotency, or concurrency guarantees.

Target foundation:

- sequential execution against snapshotted `schedule_occurrence_task` rows
- server-authoritative Task start/completion timestamps and actual duration
- Previous/Next navigation never changes Task state
- only the active membership holding the IN_PROGRESS Occurrence may execute its Tasks
- completed Tasks are immutable execution history
- Task completion idempotency and optimistic/concurrency protection
- evidence-required Tasks cannot complete until the required evidence contract is satisfied
- define evidence metadata boundary now, while deferring production media processing/upload pipeline if necessary
- optional Task notes without exposing private content publicly
- Occurrence completion derives from Task outcomes rather than client-declared status
- support COMPLETED and PARTIALLY_COMPLETED according to explicit domain rules
- server-authoritative Occurrence completion timestamp/duration
- release active-work exclusivity only through valid terminal transition
- audit Task start/complete and Occurrence terminal transition
- preserve historical snapshots despite later Task/Schedule changes
- Demo parity
- regression coverage for cross-tenant/Site/assignment, wrong sequence, duplicate completion, and concurrent completion

Do not implement claim expiry, priority ranking, reported work, or the full media normalization pipeline as part of this increment unless needed for a safe execution contract.

---

## 20. Important Deferred Items

Not yet production-complete:

- working-hours management UI
- multi-Site administration UI
- Site assignment management UI/API
- Task-by-Task execution/completion workflow
- occurrence completion / partial completion
- evidence/media pipeline
- rolling background generation worker
- reported work
- mobile field application
- claim expiry policy/configuration
- priority field/ranking
- Stripe adapter
- Razorpay adapter
- platform control plane
- deployed email/magic-link round-trip verification
- production SLO/load certification
- Task HTML sanitizer

---

## 21. Baseline Commit Chain

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
- `72ea0dc` — Update vNext context after Occurrence Foundation
- `1f5dbf7` — Add Occurrence Execution and Supersession Foundation
- `98f2eba` — Update vNext context after Occurrence Execution
- `c90de36` — Harden Occurrence Execution security boundary

`c90de368ac8567834d7f3fd735f6dc92c62b9a5c` is the current locked validated vNext baseline.

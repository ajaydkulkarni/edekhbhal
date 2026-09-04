# vNext Project Context & Continuity Notes

> **Purpose**
>
> Canonical continuity document for the clean-slate `vNext` rebuild. Keep this document concise: preserve locked architecture/business rules, validated baselines, important deferred decisions, and the immediate next increment.
>
> **Development rule:** Before every future code change, first read the latest `PROJECT-CONTEXT.md` from `v2-rebuild`, then inspect the current committed `vNext` implementation. Legacy remains the behavioral reference; deliberate vNext architecture takes precedence.

**Last updated:** 2026-09-04
**Primary rebuild branch:** `vNext`
**Latest validated vNext baseline:** `af22841cfad6dd83497bfbd34805e84e12942ece` — `Add Evidence Worker Transport Foundation 03B1`
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
- `vnext_evidence_worker`
  - NOLOGIN capability role
  - no superuser / CREATEDB / CREATEROLE / REPLICATION / `BYPASSRLS`
  - no direct sensitive-table privileges
  - `app_private` USAGE plus only exact Evidence worker command EXECUTE grants
  - cannot invoke application Evidence-read authorization/audit commands
  - deployment-specific LOGIN `vnext_evidence_worker_login` is provisioned, has no superuser/CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS attributes, and inherits only `vnext_evidence_worker`

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

### Task execution & completion

Functional commit:

`5f05615863f31200957475616f4541c19903ba88` — `Add Occurrence Task Execution and Completion Foundation`

Hardening commit:

`460a5c9e0c51b669dea039a05db76569d69ca8ef` — `Harden Occurrence Task Execution security boundary`

Migrations:

- `0014_occurrence_task_execution_completion.sql`
- `0015_occurrence_task_execution_idempotency_hardening.sql`

Migrations `0014` and `0015` are already applied to the active vNext database. **Do not reapply them.**

Implemented:

- sequential execution against snapshotted Occurrence Tasks
- starting an Occurrence starts only the first pending Task
- completing the current Task server-starts the next pending Task
- Task start/completion timestamps and actual duration are server authoritative
- optional Task execution notes, private to authenticated operational surfaces
- only the assigned active USER membership may execute an IN_PROGRESS Occurrence
- wrong-sequence completion is blocked
- completed Tasks remain historical execution records
- optimistic Task/Occurrence version checks
- concurrent duplicate completion resolves to one successful state transition
- Task completion and partial completion are idempotent
- idempotency keys are bound to the full meaningful request payload, including expected version, normalized notes/reason, and source channel
- source channel is restricted to WEB/API/MOBILE
- occurrence status is server-derived from Task outcomes
- all Tasks completed → `COMPLETED`
- reasoned early terminal transition after at least one completed Task → `PARTIALLY_COMPLETED`
- remaining unfinished Tasks become CANCELED on partial completion
- active-work exclusivity is released only by a valid terminal transition
- private `schedule_occurrence_evidence` metadata boundary with ENABLE + FORCE RLS
- runtime direct evidence INSERT/UPDATE/DELETE remains denied
- evidence-required Task completion fails closed until matching evidence metadata is VERIFIED
- Task start/completion and Occurrence terminal transitions are audited
- internal Task audit helper remains non-executable by runtime
- Demo illustrates sequential execution, explicit Task commands, evidence gating, server-derived completion, history preservation, and mismatched idempotent replay rejection

Evidence capture, the processor control plane, the leased Evidence outbox queue, the NOLOGIN worker capability role, the application-authorized read boundary, and the 03B1 worker transport/Storage authorization boundary are implemented. The portable worker currently provides a verified transport probe only; the real queue-processing loop, media codecs/derivative generation, real object deletion execution, and deployed production worker remain deferred to 03B2.

---

## 11. Audit & Outbox

Human-readable audit target:

`Date/Time Stamp | User | IP Address | Module | Action | Old Value | New Value`

Machine audit preserves Organization, actor User/Membership, actor-name snapshot, module/action, entity, old/new JSON, source, correlation/request metadata, IP, and reason where applicable.

Validated operational audit includes onboarding, Work Area/QR, Task, Schedule, occurrence claim/start/supersession, Evidence intent/upload, processor verification/rejection, original-deletion acknowledgement, and signed-read issuance.

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

Validated Evidence functional commit:

`776f392c75c2ed844e289090a5c0a4c7386db275` — `Add Evidence Capture and Media Pipeline Foundation`

Validated Storage hardening commit:

`51d8e19c5bc417307cbecec18ca07153ed71238e` — `Harden Evidence Storage upload security`

Migration:

- `0016_evidence_capture_foundation.sql`

Migration `0016` is already applied to the active vNext database. **Do not reapply it.**

Privileged Supabase Storage setup is separate from `vnext_migrator` and is deployed:

- private bucket `occurrence-evidence-private`
- bucket is not public
- 200 MB bucket ceiling
- allowed MIME types restricted to JPEG/PNG/WebP and MP4/WebM/QuickTime
- authenticated INSERT and SELECT policies only
- no Storage UPDATE/DELETE/public policy

Implemented application/storage boundary:

- no Base64/blob media in PostgreSQL
- server-issued Organization/Occurrence/Task-scoped upload intents
- only the assigned active USER executing the current IN_PROGRESS Task may initiate evidence
- snapshotted PHOTO/VIDEO requirement is enforced
- tenant-scoped non-guessable object keys
- PHOTO max 20 MB; VIDEO max 200 MB
- server-side MIME/size validation before intent creation
- SHA-256 metadata recorded on finalization
- no cross-tenant content deduplication
- Evidence metadata remains command-owned; runtime direct INSERT/UPDATE/DELETE is denied
- upload intent and finalization are idempotent and payload-bound
- upload intent expires after 15 minutes
- authenticated direct Storage upload re-evaluates the short-lived Storage INSERT policy at upload time
- wrong authenticated subject, expired intent, wrong bucket/object path, UPDATE/DELETE, and public access fail closed
- upload state remains `PENDING` verification after successful upload/finalization
- Task completion remains fail-closed until matching Evidence is `VERIFIED`
- Evidence intent/upload operations are audited
- Demo illustrates the evidence pipeline without real media writes
- public QR never exposes private evidence

Evidence processing foundation commit:

`856382812aac28b58df2eea0fad7f82d58f912d2` — `Add Evidence Verification and Media Normalization Foundation`

Migration:

- `0017_evidence_processing_foundation.sql`

Migration `0017` is already applied to the active vNext database. **Do not reapply it.**

Implemented processing control plane:

- upload finalization atomically queues `EVIDENCE_PROCESS_REQUESTED` through the transactional outbox
- Evidence processing states `NOT_QUEUED / QUEUED / PROCESSING / DONE / FAILED`
- processor claim uses a short lease, claim token, optimistic Evidence version, attempt count, and idempotency
- stale/active processing leases fail closed
- processor completion validates observed content type, byte size, and SHA-256 against uploaded metadata
- processor owns the PENDING → VERIFIED/REJECTED transition
- VERIFIED Evidence records tenant-scoped normalized/preview object metadata
- PHOTO normalized contract is JPEG/WebP; VIDEO normalized contract is MP4
- successful normalization defaults the original to `DELETE_QUEUED` unless retention is requested
- original deletion is handed off through `EVIDENCE_ORIGINAL_DELETE_REQUESTED`
- REJECTED Evidence preserves the original and never satisfies the Task evidence gate
- processing verification/rejection is audited as WORKER activity
- normal `vnext_runtime`, anon, authenticated, and public roles cannot invoke processor claim/completion commands
- no universal worker/BYPASSRLS credential was introduced
- My Work exposes processing/verification state
- Demo illustrates queued, leased, verified/rejected processing without real media writes

Evidence Worker Queue & Authorized Reads Foundation 03A commit:

`64db7b13c53a7889ced755d7d7b4de929e4c8c57` — `Add Evidence Worker Queue and Authorized Reads Foundation 03A`

Migration:

- `0018_evidence_worker_authorized_reads.sql`

Migration `0018` is already applied to the active vNext database. **Do not reapply it.**

Privileged worker capability setup is already provisioned. Migration `0019` changed the worker command contract, so the capability grants were re-applied and verified once for 03B1. **Do not rerun the grant step unless a later migration explicitly changes the contract.**

Implemented 03A boundary:

- Evidence-only transactional outbox claims use `FOR UPDATE SKIP LOCKED`
- queue claims carry worker id, random claim token, bounded lease, attempt count, last-attempt timestamp, and retry delay
- stale/mismatched worker event claims fail closed
- normal `vnext_runtime` cannot execute worker queue/deletion commands
- dedicated `vnext_evidence_worker` capability role is NOLOGIN and non-BYPASSRLS
- the worker capability role has no direct sensitive-table grants
- function ownership is deliberately split: Supabase project `postgres` creates/verifies the role; `vnext_migrator`, which owns `app_private`, grants exact command EXECUTE privileges
- no worker password, frontend service-role key, or universal Storage credential was introduced
- queued original deletion can be acknowledged only for the exact VERIFIED Evidence/version/object key and is idempotently audited
- application command authorizes Evidence reads before Storage signing
- ADMIN is Organization-wide; SITE_MANAGER remains Site-scoped; USER requires assigned Occurrence + Site scope
- `BEST` read prefers preview, then normalized, then retained original
- deleted originals cannot be requested
- signed operational URLs are capped at 60 seconds
- signed-read issuance is audited
- public QR has no private Evidence route
- My Work and Occurrences expose short-lived private Evidence view links
- Demo illustrates worker leases, least privilege, authorized reads, deletion acknowledgement, and the public-QR boundary
- global worker-queue regression fixtures are deterministic under parallel Vitest execution

Evidence Processing Worker Transport & Storage Authorization Foundation 03B1 commit:

`af22841cfad6dd83497bfbd34805e84e12942ece` — `Add Evidence Worker Transport Foundation 03B1`

Migration:

- `0019_evidence_worker_transport_foundation.sql`

Migration `0019` is already applied to the active vNext database. **Do not reapply it.** Any future database correction must use migration `0020` or later.

Implemented and provisioned 03B1 boundary:

- portable Node 22 worker transport contract; media processing is not hidden inside a Next.js request
- bounded outbox-event and Evidence-processing lease renewal/heartbeat commands
- server-owned derivative targets: PHOTO → `normalized.webp` + `preview.webp`; VIDEO → `normalized.mp4` + `preview.jpg`
- worker completion wrapper does not accept arbitrary derivative keys; the server selects exact Organization/Occurrence/Task/Evidence-scoped targets
- the older free-form `complete_evidence_processing(...)` command is revoked from `vnext_evidence_worker`
- dedicated NOLOGIN capability role remains non-BYPASSRLS with no direct sensitive-table grants
- dedicated LOGIN `vnext_evidence_worker_login` is provisioned and inherits only the worker capability role
- dedicated ordinary Supabase Auth machine principal is ACTIVE, has no application User or Organization membership, and is mapped to one exact worker id
- worker Storage policies use ordinary authenticated sessions plus the publishable key; no service-role/secret API key or S3 static key is used
- Storage SELECT/INSERT/UPDATE/DELETE worker policies are constrained by exact machine principal, worker id, object path, outbox lease, and processing lease
- original deletion authorization is limited to the exact VERIFIED/DELETE_QUEUED Evidence and exact live deletion delivery
- `supabase-storage/002_occurrence_evidence_worker_transport.sql` is deployed
- worker capability re-grant after `0019` is applied and verified
- server-only worker credentials are stored outside Git in `.env.worker.local`; that file remains ignored
- `worker:evidence:probe` validates DB role/capability inheritance, machine-principal mapping, and legacy-completion revocation without claiming queue work or touching Storage objects
- Demo explains the 03B1 transport, heartbeat, least-privilege machine identity, server-owned path, and no-universal-secret boundaries

Still required after 03B1 before the Evidence pipeline is production-complete:

- implement the real leased queue-processing loop with retry/backoff, duplicate-delivery safety, and crash/restart recovery
- independently fetch and validate actual source MIME, byte size, and SHA-256 inside the worker
- generate optimized/compressed PHOTO derivatives and preview with a production-supported image codec
- normalize VIDEO to MP4 and generate poster/preview with ffmpeg/ffprobe or another production-supported media processor
- upload derivatives only to the server-owned keys selected by the 03B1 command boundary
- execute real Storage deletion for `EVIDENCE_ORIGINAL_DELETE_REQUESTED`, then acknowledge `DELETED`
- preserve the original on processing rejection/failure and clean up partial derivative writes safely
- add live authenticated Storage signed-read transport E2E including expiry and unauthorized/cross-tenant denial
- certify duplicate delivery, stale lease/token, restart recovery, deletion retry, object tampering, cross-tenant key, and derivative-upload-failure cases
- deploy the actual worker runtime and complete real Storage/media processing end-to-end plus production load/SLO certification

Original media must be discarded after successful normalization unless policy/entitlement explicitly retains it.

---

## 16. Billing & Platform Control Plane

Billing remains provider-neutral.

Commercial modes include FREE/SPONSORED/TRIAL/PAID/CUSTOM_CONTRACT. Current catalog includes FREE_BETA/STANDARD/PROFESSIONAL.

FREE_BETA activation is functional. Paid activation fails closed until an adapter exists. Stripe is planned first; Razorpay later behind the same abstraction.

Platform administration is separate from customer tenant roles. No frontend universal database credential is permitted.

---

## 17. Current Validated Test Baseline

At commit `af22841cfad6dd83497bfbd34805e84e12942ece`:

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
- Occurrence Task Execution & Completion + hardening: **14/14 PASS**
- Evidence Capture & Storage hardening: **10/10 PASS**
- Evidence Verification & Media Normalization Foundation 02: **6/6 PASS**
- Evidence Worker Queue & Authorized Reads Foundation 03A: **6/6 PASS**
- Evidence Worker Transport & Storage Authorization Foundation 03B1: **5/5 PASS**
- Total integration: **116/116 PASS**

### Full Vitest

- Test files: **38/38 PASS**
- Tests: **193/193 PASS**

### Build gates

- TypeScript: **PASS**
- ESLint: **PASS**
- Next.js production build: **PASS**
- Generated routes: **17/17**
- `git diff --check`: **PASS**
- Evidence worker transport probe: **PASS**

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
- `/workspace/evidence/[id]`
- `/workspace/work-areas`
- `/workspace/work-areas/[id]/qr`
- `/q/[token]`

### Playwright

- **3/3 PASS**
- Demo regression covers planning, My Work / claim / QR-start / supersession, sequential Task execution/completion, Evidence upload/verification gating, expired-intent/wrong-object fail-closed behavior, queued/leased processor behavior, verification/normalization safety boundaries, worker least privilege, 60-second authorized reads, public-QR Evidence isolation, and idempotency/security explanation

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

**Evidence Processing Worker — Real Media Processing Foundation 03B2**

Build on validated 03B1 without weakening tenant isolation, the NOLOGIN capability-role boundary, the dedicated least-privilege LOGIN, the ordinary authenticated machine Storage principal, live-lease Storage authorization, server-owned derivative paths, outbox idempotency, Evidence history, signed-read authorization, or the VERIFIED Task gate.

Target foundation:

- turn the portable worker transport into a real leased queue-processing loop for `EVIDENCE_PROCESS_REQUESTED`
- renew outbox and processing leases during long media operations; stale/mismatched tokens remain fail-closed
- independently download the exact private original and calculate/validate actual MIME, byte size, and SHA-256
- PHOTO: use a production-supported image library such as `sharp` to normalize/compress to the server-owned WebP derivative and create the preview
- VIDEO: use ffmpeg/ffprobe or another production-supported processor to normalize to MP4 and create the JPEG poster/preview
- upload only the derivative objects returned by the 03B1 target command
- complete VERIFIED/REJECTED only through the constrained 03B1 transport completion wrapper
- preserve original media on rejection/failure
- consume `EVIDENCE_ORIGINAL_DELETE_REQUESTED`, delete the exact original, and acknowledge `DELETED`
- make partial derivative upload/processing failures retry-safe and cleanup-safe
- certify duplicate queue delivery, worker restart/crash recovery, stale leases/tokens, cross-tenant object attempts, source tampering, derivative upload failure, and deletion retry
- add live machine-authenticated Storage tests plus signed-read expiry/unauthorized/cross-tenant certification
- provide Docker/runtime health and deployment configuration without committing machine secrets
- retain Demo as synthetic/read-only; illustrate processing/retry/deletion behavior without real media writes

Keep mobile camera UX, claim expiry, priority ranking, reported work, billing, and unrelated platform-control work separate unless the 03B2 worker contract requires them.

---

## 20. Important Deferred Items

Not yet production-complete:

- working-hours management UI
- multi-Site administration UI
- Site assignment management UI/API
- deployed Evidence processor runtime/queue loop, real media normalization codecs, real original-object deletion execution, derivative retry/cleanup, and live signed-read transport certification
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
- `8536cd7` — Update vNext context after Occurrence Execution hardening
- `5f05615` — Add Occurrence Task Execution and Completion Foundation
- `460a5c9` — Harden Occurrence Task Execution security boundary
- `776f392` — Add Evidence Capture and Media Pipeline Foundation
- `51d8e19` — Harden Evidence Storage upload security
- `8563828` — Add Evidence Verification and Media Normalization Foundation
- `64db7b1` — Add Evidence Worker Queue and Authorized Reads Foundation 03A
- `af22841` — Add Evidence Worker Transport Foundation 03B1

`af22841cfad6dd83497bfbd34805e84e12942ece` is the current locked validated vNext baseline.

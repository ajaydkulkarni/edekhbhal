# vNext Project Context & Continuity Notes

> **Purpose**
>
> Canonical continuity document for the clean-slate `vNext` rebuild. Keep this document concise: preserve locked architecture/business rules, validated baselines, important deferred decisions, and the immediate next increment.
>
> **Development rule:** Before every future code change, first read the latest `PROJECT-CONTEXT.md` from `v2-rebuild`, then inspect the current committed `vNext` implementation. Legacy remains the behavioral reference; deliberate vNext architecture takes precedence.

**Last updated:** 2026-09-04
**Primary rebuild branch:** `vNext`
**Latest validated vNext baseline:** `342e8fca95710e978946a79d74ba8b538e4756ab` — `feat: add mobile field execution foundation 05A`
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

- `vnext_occurrence_worker`
  - dedicated NOLOGIN rolling-horizon generation capability role
  - no superuser / CREATEDB / CREATEROLE / REPLICATION / `BYPASSRLS`
  - no direct sensitive-table privileges
  - `app_private` USAGE plus exactly three generation commands: claim / complete / fail
  - cannot inherit runtime or Evidence-worker capabilities
  - deployment LOGIN `vnext_occurrence_worker_login` inherits only `vnext_occurrence_worker`, uses connection limit 3, and has no direct table grants

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

Evidence capture, the processor control plane, the leased Evidence outbox queue, the NOLOGIN worker capability role, the application-authorized read boundary, the real media-processing worker, and the 03B3 live Storage/deployment certification are implemented and validated. Functional Evidence processing is therefore certified end-to-end; production load/SLO and deliberate fault-injection remain separate hardening work.

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

Mobile Field Execution Foundation 05A is implemented on the stabilized Schedule/Occurrence/QR execution contracts. Real-device certification remains the next mobile increment.

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


Evidence Processing Worker — Real Media Processing Foundation 03B2 commit:

`948f14c85f359f740d17d0aeda1f5f647ae50ca8` — `feat: add real evidence media processing worker 03B2`

Migration:

- `0020_evidence_worker_media_execution_hardening.sql`

Migration `0020` is already applied to the active vNext database. **Do not reapply it.**

Validated 03B2 implementation:

- real leased queue-processing loop for Evidence processing and original deletion
- event-bound processing claims use the live event token and current Evidence version
- terminal-state outbox acknowledgement prevents premature queue completion
- independent source SHA-256, byte-size, and MIME observation
- Sharp/libvips PHOTO normalization to WebP normalized/preview derivatives
- ffprobe/FFmpeg VIDEO validation and MP4 normalization plus JPEG preview
- bounded lease heartbeat and exponential retry/backoff
- retry-safe processing-lease release
- partial derivative cleanup with deterministic server-owned overwrite-safe paths
- observation-based rejection preserves the original
- successful verification queues exact original deletion
- exact live deletion delivery removes and acknowledges the original
- Node 22 production Docker image includes Sharp, FFmpeg, and ffprobe
- media runtime check and least-privilege DB/Auth transport probe are validated
- 03B2 full Vitest baseline was 41/41 files and 207/207 tests

Evidence Processing Worker — Live Storage & Deployment Certification 03B3 hardening commit:

`032ed8c80db4892fc0cdeccd0bdcf689beafda06` — `fix: harden evidence original deletion confirmation 03B3`

Migration:

- `0021_evidence_storage_delete_confirmation_hardening.sql`

Migration `0021` is already applied to the active vNext database. **Do not reapply it.** Worker capability grants did not change and must not be rerun for 0021.

Validated 03B3 certification:

- a dedicated ordinary authenticated USER executed real PHOTO and VIDEO uploads through the private Supabase Storage RLS boundary; server-owned upload intents and transactionally queued processing remained authoritative
- real PHOTO processing independently observed source MIME, byte size, and SHA-256, produced server-owned WebP normalized/preview derivatives, reached `VERIFIED / DONE / DELETE_QUEUED`, physically deleted the exact original, preserved derivatives, advanced to `DELETED`, and then allowed Task/Occurrence completion
- real VIDEO processing used ffprobe/FFmpeg, produced H.264/yuv420p MP4 with AAC audio plus a 1280×720 JPEG poster, reached the same verified/delete lifecycle, physically deleted the exact original, preserved both derivatives, and allowed Task/Occurrence completion
- 03B3 exposed and fixed a deletion-confirmation defect: Storage deletion needs worker SELECT visibility as well as DELETE visibility; 0021 adds the exact live `DELETE_QUEUED` original read capability, denies human original reads after `DELETED`, and transport now confirms exact object visibility both before and after `.remove()` before acknowledging database deletion
- `BEST` authorized reads resolve to preview when available; explicit NORMALIZED/PREVIEW reads are authorized; explicit ORIGINAL is denied after deletion; cross-tenant authorization fails closed
- 60-second signed URLs were created through the real private Storage path, signed-read issuance was audited, fresh access returned the normalized VIDEO, and access failed after expiry
- production `--run` worker startup, media runtime check, graceful SIGTERM shutdown, clean restart, and transport close behavior are validated
- lease-based crash/restart recovery is validated: an abandoned event claim blocks early takeover, replacement worker reclaims only after lease expiry, and terminal reconciliation clears the delivery without mutating terminal Evidence/version/derivative references
- production Docker media runtime is validated with Sharp 0.35.4/libvips 8.18.6 and FFmpeg/ffprobe 5.1.9; the Codespace host itself intentionally does not need FFmpeg installed
- least-privilege worker probe remains PASS for `vnext_evidence_worker_login`, machine-principal binding, event-bound commands, and revoked free-form capabilities
- `.env.worker.local` and `.env.03b3.local` remain ignored; no machine credentials or service-role key are committed
- final eligible Evidence worker queue was empty and the repository worktree was clean at the functional baseline

Functional 03B3 Evidence certification is complete. Production load/SLO measurement and deliberate derivative-write fault-injection/chaos testing remain separate later hardening work and do not invalidate this functional baseline.

Original media must be discarded after successful normalization unless policy/entitlement explicitly retains it.

---

## 16. Billing & Platform Control Plane

Billing remains provider-neutral.

Commercial modes include FREE/SPONSORED/TRIAL/PAID/CUSTOM_CONTRACT. Current catalog includes FREE_BETA/STANDARD/PROFESSIONAL.

FREE_BETA activation is functional. Paid activation fails closed until an adapter exists. Stripe is planned first; Razorpay later behind the same abstraction.

Platform administration is separate from customer tenant roles. No frontend universal database credential is permitted.

---

## 17. Current Validated Test Baseline

At commit `342e8fca95710e978946a79d74ba8b538e4756ab`:

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
- Evidence Processing Worker Media Execution Hardening 03B2/03B3 contract: **4/4 integration PASS**
- Total integration: **120/120 PASS**

### Full Vitest

- Test files: **57/57 PASS**
- Tests: **316/316 PASS**
- Mobile Field Execution 05A focused module additions: **40/40 PASS**

### Build gates

- TypeScript: **PASS**
- ESLint: **PASS**
- Next.js production build: **PASS**
- Generated routes: **17/17**
- `git diff --check`: **PASS**
- Evidence worker production-Docker media runtime check: **PASS**
- Evidence worker transport/identity probe: **PASS**
- Occurrence worker dedicated production-Docker build: **PASS**
- Occurrence worker containerized non-mutating health check: **PASS**
- Occurrence worker dedicated LOGIN / exact three-function probe: **PASS**
- Occurrence worker exhaustive least-privilege audit: **PASS**

Validated routes include:

- `/`
- `/demo`
- `/login`
- `/register`
- `/auth/callback`
- onboarding routes
- `/workspace`
- `/workspace/my-work`
- `/workspace/my-work/[occurrenceId]`
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

### Live 03B3 certification

- real authenticated PHOTO upload → process → derivative verification → hardened physical original deletion → Task/Occurrence completion: **PASS**
- real authenticated VIDEO upload → FFmpeg normalization/poster → hardened physical original deletion → Task/Occurrence completion: **PASS**
- signed read authorization, audit, cross-tenant/deleted-original denial, fresh access, and 60-second expiry: **PASS**
- continuous worker startup/media runtime, graceful shutdown, and clean restart: **PASS**
- lease-based crash/restart recovery and terminal reconciliation without Evidence mutation: **PASS**

### Live 04A certification

- real rolling-horizon worker generation through the canonical 48-hour horizon: **PASS**
- natural rolling-horizon extension without rewriting existing Occurrences/Tasks: **PASS**
- exact-horizon additive idempotency: **PASS**
- multi-worker `FOR UPDATE ... SKIP LOCKED` concurrency behavior: **PASS**
- natural lease expiry and reclaim by another dedicated worker session: **PASS**
- failure acknowledgement, exact retry delay, and attempt-2 reclaim: **PASS**
- WEEK recurrence / America-Denver DST gap / DST overlap canonical offset: **PASS**
- working-hours acceptance/rejection and source/snapshot preservation: **PASS**
- inactive Work Area fail-close for new generation: **PASS**
- dedicated occurrence-worker container build and non-mutating health check: **PASS**
- continuous `--run` startup, idle polling, SIGTERM shutdown, clean restart, and second graceful shutdown: **PASS**
- lifecycle certification preserved the global generation-state hash and the certified rolling fixture: **PASS**
- focused 04A module regression: **68/68 PASS**
- full repository Vitest: **52/52 files, 276/276 tests PASS**
- TypeScript / ESLint / Next.js production build / `git diff --check`: **PASS**

Production scale/load/SLO certification remains deferred and is not claimed by 04A.
The Demo remains synthetic/read-only; 04A introduces no Demo tenant write path.

---


### 05A implementation validation

Validated functional commit:

`342e8fca95710e978946a79d74ba8b538e4756ab` — `feat: add mobile field execution foundation 05A`

- exact release surface: **12 files**
- focused authenticated USER route `/workspace/my-work/[occurrenceId]`: **PASS**
- exact tenant-scoped focused occurrence reader remains read-only: **PASS**
- server-selected `MOBILE` attribution for claim / QR start / Task completion / partial completion: **PASS**
- server-selected `MOBILE` attribution for Evidence intent / finalization: **PASS**
- camera QR implementation with rear-camera preference: **PASS**
- canonical `/q/{token}` QR URL extraction plus manual token fallback: **PASS**
- QR detection does not auto-submit or bypass server authorization: **PASS**
- camera MediaStream cleanup on stop/unmount: **PASS**
- authoritative current Task is independent from the Task selected for viewing: **PASS**
- Previous/Next Task navigation is GET/read-only: **PASS**
- completed/non-current/future Tasks expose no Task-completion or Evidence-capture mutation surface: **PASS**
- refresh/re-entry returns to current server state: **PASS**
- invalid `?task=` selection safely falls back to the actual active Task: **PASS**
- PHOTO/VIDEO capture reuses the existing private Evidence Storage pipeline: **PASS**
- `capture="environment"` mobile camera/camcorder hint: **PASS**
- PHOTO 20 MB / VIDEO 200 MB and existing MIME contracts retained: **PASS**
- client SHA-256 finalization retained: **PASS**
- Evidence upload remains pending verification; Task completion remains blocked until required Evidence is `VERIFIED`: **PASS**
- Demo source remains synthetic/read-only and was not changed by 05A: **PASS**
- no database migration was required; migration `0026` was not created or applied
- full repository Vitest: **57/57 files, 316/316 tests PASS**
- TypeScript / ESLint / Next.js production build / `git diff --check`: **PASS**

05A is **implementation complete**.

Not claimed by 05A:

- real-phone QR camera E2E
- real-phone PHOTO/VIDEO camera/camcorder E2E
- live field-user mutation certification through the new mobile route
- production mobile-browser compatibility certification

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

## 19. Occurrence Rolling-Horizon Generation Worker Foundation 04A — COMPLETE

Validated functional commit:

`e079c6156586959a83140c16319ce7ddb167a510` — `feat: add occurrence rolling-horizon generation worker 04A`

Migrations:

- `0022_occurrence_generation_worker.sql`
- `0023_app_private_function_privilege_hardening.sql`
- `0024_occurrence_generation_claim_eligibility.sql`
- `0025_occurrence_generation_claim_concurrency_hardening.sql`

Migrations `0022`, `0023`, `0024`, and `0025` are already applied to the active vNext database. **Do not reapply them.**

Privileged role files:

- `003_occurrence_worker_capability_role.sql`
- `004_occurrence_worker_login_role.sql`

The dedicated occurrence worker credential remains outside Git in `.env.occurrence-worker.local`. Never commit or print that secret.

Implemented and validated:

- portable Node background worker independent of Next.js request execution
- canonical normal 48-hour rolling horizon
- maximum database reconciliation bound remains 7 days
- additive generation path inserts only missing Schedule + UTC Occurrences
- existing Occurrence and Occurrence Task snapshots are not churned by routine worker passes
- immediate Schedule create/edit/status reconciliation remains the application path for user-facing planning changes
- inactive Organization/Site/Work Area/Schedule parents fail closed for new generation
- recurrence, timezone, DST, effective working-hours, evidence decision, and snapshot logic remain database authoritative
- deterministic due ordering
- generation-state row per Schedule maintained independently by Schedule trigger
- claim acquisition uses `FOR UPDATE OF gs SKIP LOCKED`
- multiple worker instances do not block on claim-time state discovery
- bounded 15–300 second claim leases
- bounded retry acknowledgement with worker runtime minimum aligned to the database contract
- natural lease expiry allows safe reclaim after worker crash/loss
- claim token + worker id + live lease bind completion/failure acknowledgement
- dedicated NOLOGIN capability role and dedicated LOGIN
- exact worker function surface is only claim / complete / fail
- no direct sensitive-table privileges
- no `BYPASSRLS`, runtime-role inheritance, Evidence-worker inheritance, service-role key, or universal database credential
- non-mutating `--probe` and `--health-check`
- at-most-one `--once`
- continuous `--run` polling loop
- SIGTERM/SIGINT graceful shutdown
- restart-safe execution
- dedicated DB-only production Dockerfile using unprivileged `node` + `dumb-init`
- Evidence worker Docker/runtime remains independent and unchanged
- production load/SLO remains deferred

### 04A handoff

Mobile Field Execution Foundation 05A has now been implemented and validated.
See Section 20 for the locked implementation baseline and Section 20's immediate next increment.

---

## 20. Mobile Field Execution Foundation 05A — IMPLEMENTATION COMPLETE

Validated functional commit:

`342e8fca95710e978946a79d74ba8b538e4756ab` — `feat: add mobile field execution foundation 05A`

No database migration was required. Migration `0026` was not created or applied.

Implemented:

- mobile-first authenticated USER entry from `/workspace/my-work`
- focused route `/workspace/my-work/[occurrenceId]`
- exact tenant-scoped focused occurrence read path
- focused reads do not invoke supersession or execution mutation commands
- dedicated server-selected `MOBILE` wrappers for claim, QR start, Task completion, partial completion, Evidence intent, and Evidence finalization
- existing WEB execution action boundaries remain intact
- Work Area QR camera scanning when browser support is available
- canonical QR URL token extraction with manual token fallback
- QR capture never grants authorization and never auto-starts work
- server remains authoritative for membership, Site scope, assignment, active-work exclusivity, lifecycle state, and exact active Work Area QR
- sequential Occurrence Task execution
- authoritative current `IN_PROGRESS` Task separated from the Task selected only for viewing
- Previous/Next changes only the viewed Task
- completed/non-current/future Tasks remain read-only
- refresh/re-entry reflects current server state
- invalid `?task=` values fall back to the active Task
- PHOTO/VIDEO capture through the existing private Supabase Storage Evidence pipeline
- mobile rear-camera/camcorder capture hint
- existing Evidence MIME and size limits retained
- client SHA-256 finalization retained
- upload/finalization does not imply verification
- Task completion remains fail-closed until required matching Evidence is `VERIFIED`
- responsive mobile execution presentation
- Demo remains synthetic/read-only and has no real mobile execution/media-write path

Validation:

- exact 05A release surface: **12 files**
- focused 05A module contracts: **40/40 PASS**
- full repository Vitest: **57/57 files, 316/316 tests PASS**
- TypeScript: **PASS**
- ESLint: **PASS**
- Next.js production build: **PASS**
- `git diff --check`: **PASS**
- no secret/environment file in release surface: **PASS**
- no 05A database migration: **PASS**

Not claimed:

- real-phone QR-camera E2E
- real-phone PHOTO/VIDEO camera/camcorder E2E
- live field-user claim/start/Task-completion certification through the new mobile route
- production mobile-browser compatibility matrix

### Immediate next increment

**Mobile Field Execution Live Device Certification 05B**

Use a controlled certification fixture and an ordinary authenticated USER to validate the implemented 05A field path on a real HTTPS-served mobile browser.

Initial target:

- real-phone camera permission and QR scanning against an actual Work Area QR
- canonical QR URL extraction and manual fallback
- controlled live claim and QR start through the existing server-authoritative commands
- refresh/re-entry while claimed and while `IN_PROGRESS`
- Previous/Next read-only behavior on a real mobile browser
- real PHOTO and VIDEO capture/selection through the existing private Storage pipeline
- verification/processing-state refresh and Evidence gating
- sequential Task completion through terminal Occurrence state
- camera denial / unsupported `BarcodeDetector` fallback
- preserve Site scope, active-work exclusivity, idempotency, historical immutability, and Demo read-only boundaries

Do not claim browser/device compatibility beyond devices and browsers actually certified.

---

## 21. Important Deferred Items

Not yet production-complete:

- working-hours management UI
- multi-Site administration UI
- Site assignment management UI/API
- reported work
- claim expiry policy/configuration
- priority field/ranking
- Stripe adapter
- Razorpay adapter
- platform control plane
- deployed email/magic-link round-trip verification
- production SLO/load certification, including Evidence worker load measurement and optional deliberate derivative-write fault-injection/chaos testing
- Task HTML sanitizer
---

## 22. Baseline Commit Chain

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
- `948f14c` — Add real Evidence media processing worker 03B2
- `032ed8c` — Harden Evidence original deletion confirmation 03B3

- `e079c61` — Add Occurrence Rolling-Horizon Generation Worker Foundation 04A
- `342e8fc` — Add Mobile Field Execution Foundation 05A

`342e8fca95710e978946a79d74ba8b538e4756ab` is the current locked validated vNext functional baseline.

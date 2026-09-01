# eDekhbhal — Project Context, Functional Brief & Continuity Notes

> **Purpose**
>
> This is the canonical continuity document for the eDekhbhal project. It records the current product direction, architecture, business rules, security posture, deployment/test state, Demo Workspace rules, mobile state, and immediate next steps.
>
> **When development resumes:** read this file first, then inspect the latest `v2-rebuild` branch before making changes. Preserve the architectural and business-rule decisions below unless the product owner explicitly changes them.

**Last updated:** 2026-09-01  
**Current application version:** v0.9.1 base with eDekhbhal Next previews / fine-tuning / Demo Workspace increments  
**Primary development branch:** `v2-rebuild`  
**V2 Web URL:** `https://edekhbhal.vercel.app`  
**Latest validated V2 commit used by E2E:** `dd02d76449f658a9bd40bbf60792fc19b946871c`  
**Current verified Web/API E2E baseline:** **41/41 PASS**  
**Demo Workspace focused E2E:** **5/5 PASS**  
**RLS status:** runtime context foundation is implemented and tested, but **RLS is NOT enabled on business tables**.

**Current Android field build:** v0.8.1, versionCode 3, EAS build `55db02b1-76dd-4e86-9f73-db97be2a17c7`, source commit `ad4ea3bf21658583c07843d6569b09e174459316`.

---

## 1. Canonical Development Workflow

For every future eDekhbhal code change:

1. Read the latest `PROJECT-CONTEXT.md` from `v2-rebuild` first.
2. Inspect the latest relevant source files from `v2-rebuild`.
3. Preserve existing architecture/business rules.
4. Implement the change in both the real Organization Workspace and Demo Workspace when applicable.
5. Add or update automated regression coverage.
6. Run compile/typecheck and relevant E2E tests.
7. Update this context after validation.

The product owner does not want instructions that require manually editing code. Provide complete replacement/new files for upload when code changes are needed.

---

## 2. Product Vision

eDekhbhal is a multi-tenant SaaS platform for:

- Organization and property operations
- Work Area management
- reusable Tasks
- recurring and one-time Schedules
- pre-generated Schedule Occurrences
- mobile field execution
- evidence capture
- notes / reported work
- personnel and property assignments
- operational reporting
- public Work Area service transparency
- auditability
- future subscription enforcement
- future production-grade RLS

The core hierarchy is:

`Organization → Property → Work Area`

Tasks are reusable Organization-level definitions.

Schedules bind:

- one Work Area;
- one or more Tasks;
- sequence;
- planned duration;
- evidence rules;
- recurrence/timing.

Execution happens against generated Occurrences, not against Schedule masters.

---

## 3. Non-Negotiable Business Rules

### Tenant isolation

The application is multi-tenant. A user may only operate inside Organizations to which they have an active membership.

Target-Organization membership must be validated before authorization shortcuts.

### Organization name

Organization Name is immutable after creation.

### Soft lifecycle

Normal business operation uses soft status/inactivation. Do not destructively delete normal master/history records.

### Working hours inheritance

Effective working hours resolve:

`Work Area override → Property override → Organization default`

`null` at a lower level means inherit from the parent.

### Historical snapshots

Generated Occurrences snapshot planned data. Later changes to Task/Schedule/Property/Work Area definitions must not rewrite completed or in-progress history.

### Random evidence

`RANDOM` means evidence is required on a deterministic subset of performances, e.g. 1 in every N.

It does **not** mean randomly choose Photo vs Video every time.

Random selection is resolved at occurrence generation and consumed by mobile.

### Audit

Meaningful operations must be auditable. `AuditLog` is treated as append-only historical evidence.

---

## 4. Roles and Access

Roles:

- `ADMIN`
- `PROPERTY_MANAGER`
- `USER`

Current fine-tuned access policy:

### Admin

- Organization-wide access.
- Organization settings.
- Team and membership management.
- Property create/edit/status.
- Work Area management.
- Task/Schedule management.
- Reporting/Audit access.
- Property assignments.
- Subscription/account administration.

### Property Manager

- Assignment-based Property scope.
- Assigned Property master data is read-only.
- Can manage Work Areas, Tasks and Schedules within permitted operational scope.
- Can view/action Reported Work only for assigned Properties.
- Can maintain permitted USER personnel information within assigned scope.
- Cannot modify Organization settings or Property master fields.

### User

- Assignment-based operational scope.
- User with no assigned Property receives no mobile executable work.
- Task/Schedule masters are read-only.
- Cannot perform management actions such as reported-item dismissal.
- Mobile execution is the primary operational role.

---

## 5. Authentication

Web uses the application-managed session model, including:

- `User`
- `MagicLinkToken`
- `Session`
- `edk_session` HTTP-only cookie

Mobile supports:

- magic-link/development auth flow;
- Email + Password after password creation;
- Bearer Session token stored securely on device.

`Session.authMethod` distinguishes PASSWORD and MAGIC_LINK.

Password hashes use a one-way scrypt implementation.

---

## 6. Properties and Work Areas

### Property

A Property belongs to an Organization.

Property master create/edit is Admin-only under the fine-tuned access model.

Address is prefilled from Organization at creation, but stored independently thereafter.

### Work Area

A Work Area belongs to a Property.

Work Areas expose:

- name/description/location;
- working-hours inheritance/override;
- ACTIVE/INACTIVE lifecycle;
- active QR identity;
- service status.

Only active Work Areas under active Properties are selectable for new Schedules.

---

## 7. QR Architecture

Each Work Area has a database-backed QR identity.

### Reprint

Reprint uses the same active QR identity.

### Regenerate

Regenerate:

1. revokes the current QR;
2. creates a new QR for the same Work Area;
3. makes the old QR invalid.

### Dual-purpose physical QR

The same physical Work Area QR supports:

1. authenticated eDekhbhal mobile scan for execution validation;
2. ordinary phone-camera access to the public Web transparency page.

The public route uses the active database QR record identity.

Public transparency must not expose private notes, internal audit details, worker contact information, or private evidence unless a future explicit decision changes that rule.

Schedule detail displays the latest ACTIVE QR for its Work Area.

---

## 8. Tasks

Tasks are Organization-level reusable masters.

Key fields/capabilities:

- name;
- rich HTML description;
- ACTIVE/INACTIVE status;
- attachments;
- ad-hoc Schedule-only Tasks in the Next preview.

Authorized management roles may create/edit Tasks. USER is read-only.

Task attachments are still a production-hardening area; object storage is preferred over database Base64 for production.

---

## 9. Schedules

Schedules support:

- `ONE_TIME`
- `RECURRING`

Recurring units include:

- minute;
- hour;
- day;
- week;
- month;
- year.

Optional recurring end date is inclusive through the end of the calendar day in the Schedule timezone.

A Schedule contains ordered Task associations with:

- planned duration;
- planned start/end offsets;
- evidence rule;
- RANDOM evidence configuration;
- sequence.

Task timing recalculates when duration or order changes.

The Schedule must fit completely inside an effective open working-hours window to be generated.

---

## 10. Occurrence Architecture

Execution model:

`Schedule → ScheduleOccurrence → ScheduleOccurrenceTask → ScheduleOccurrenceEvidence`

### ScheduleOccurrence

Represents one planned Schedule firing.

Important concepts include:

- Organization;
- Schedule;
- Work Area;
- scheduled start/end;
- timezone;
- Property/Work Area/Schedule snapshots;
- planned duration;
- status;
- assigned user;
- start/completion timestamps;
- auto-miss metadata.

Uniqueness is based on Schedule + scheduled start.

Statuses include:

- PENDING
- IN_PROGRESS
- COMPLETED
- PARTIALLY_COMPLETED
- MISSED
- CANCELED

### ScheduleOccurrenceTask

Snapshots:

- Task identity/name/instructions;
- sequence;
- planned duration/start/end;
- evidence decision;
- actual execution timestamps/duration;
- completion user.

### Evidence

Evidence metadata is stored in PostgreSQL while media lives in private Supabase Storage.

Mobile currently supports live-camera evidence capture.

---

## 11. Rolling Occurrence Generation

The architecture intentionally avoids a once-per-minute scheduler.

A rolling generator creates/reconciles upcoming work, historically using a 48-hour horizon.

Schedule create/edit triggers immediate generation/reconciliation.

Future PENDING occurrences may be reconciled.

IN_PROGRESS and historical completed records must not be rewritten.

---

## 12. Smart Recurring-Schedule Supersession

Recurring operational Schedules support `supersedeUnstarted = true` by default.

Rule:

> Latest due occurrence wins.

When a newer occurrence becomes due:

- older unstarted PENDING occurrences may be marked MISSED;
- a claimed-but-unstarted occurrence may be released and marked MISSED;
- occurrence Tasks are also marked MISSED;
- reason/time are stored;
- history is preserved.

IN_PROGRESS, COMPLETED, PARTIALLY_COMPLETED, MISSED and CANCELED records are not rewritten.

---

## 13. Mobile Execution

Current mobile field flow is operational and smoke-tested:

1. USER signs in.
2. My Work returns eligible queue work.
3. USER accepts/claims an occurrence.
4. USER goes to Work Area.
5. QR validates the Work Area and starts execution.
6. Server writes authoritative occurrence/task start timestamps.
7. Tasks execute sequentially.
8. Evidence is captured when required.
9. Task/Schedule notes may be recorded.
10. Completion writes authoritative end/duration.
11. Personal Report/Profile remain available.

Claim expiry is Organization-configurable.

A USER cannot hold two active pending/in-progress assignments simultaneously.

Server time is authoritative; mobile timers display elapsed time from server timestamps.

Mobile navigation:

`My Work | Scan | Report | Profile`

The v0.8.1 Android safe-area/navigation hotfix remains the current field binary.

---

## 14. Mobile Localization and Profile

Supported initial UI languages include:

- English
- Hindi
- Marathi
- Gujarati
- Bengali
- Punjabi
- Tamil
- Telugu
- Kannada
- Malayalam
- Spanish
- French
- Arabic

Organization/Property/Work Area business identifiers are not silently translated.

Task/Schedule content translation is server-side/cached where a provider is configured, with English fallback.

Translation failure must never block field execution.

Mobile Profile supports:

- Display Name;
- preferred language;
- password management;
- Organization/Role/Timezone context;
- Sign Out.

Text-to-speech is available for Task content.

---

## 15. Supervisor Dashboard

Admin/Property Manager Dashboard includes operational command-center behavior such as:

- workforce presence;
- current assignment context;
- activity feed;
- recent evidence;
- Attention Required;
- today's Schedule progress;
- operational KPIs.

Presence uses lightweight mobile heartbeat telemetry rather than AuditLog spam.

Dashboard access and queries must remain Organization/Property scoped.

---

## 16. Reports

Current reporting includes:

### Service Log

Task-performance-level report using occurrence snapshots.

Supports filtering, sorting, CSV and XLSX export.

### Service Compliance

Includes:

- completed / partial / missed KPIs;
- compliance percentage;
- Property/Work Area/Schedule/User/status filters;
- grouped summaries;
- occurrence drill-down.

### Reported Notes / Work Requests

Mobile Task/Schedule notes can create explicit `ReportedWorkItem` records.

Management can:

- review reports;
- dismiss historically without deleting them;
- create a follow-up Schedule;
- preserve linkage/history.

A dismissed report can later produce a Schedule without losing its dismissal history.

### Occurrence detail

Authorized management can inspect planned vs actual execution, notes and signed evidence previews.

---

## 17. Personnel and Property Assignments

Personnel profile foundation supports:

- name;
- address;
- phone;
- Role;
- Status;
- internal Notes;
- private profile photo;
- verification documents;
- expiry metadata.

Internal Notes are not shown in self-service profile.

OrganizationMember ↔ Property is many-to-many.

Assignment scoping is a core security boundary.

---

## 18. Entitlement / Subscription Foundation

The application has entitlement/subscription foundations.

Billing is intentionally not implemented yet.

Do not add billing assumptions to business logic until pricing/plan enforcement is explicitly designed.

---

# Demo Workspace

## 19. Demo Workspace — Canonical Product Direction

A universal built-in Demo Workspace exists alongside real Organization Workspaces.

Visible brand:

**eDekhbhal Best Practice Demo**

Internal neutral identifiers should be used in code, such as:

- `workspaceMode = "DEMO"`
- `demoWorkspaceId = "best-practice-demo"`

Persistent indication:

**DEMO WORKSPACE — Sample data**

The Demo is not a normal Organization row and users are not granted a shared Demo Organization membership.

This separation is intentional so Demo functionality does not weaken tenant isolation or complicate RLS.

Canonical companion document:

`DEMO-WORKSPACE-ARCHITECTURE.md`

---

## 20. Standing Demo Parity Rule — MANDATORY

**Every new functional addition or change to the real Organization Workspace must automatically be evaluated and implemented in the Demo Workspace as well, without requiring the product owner to repeat this instruction.**

Examples:

- new navigation/page → corresponding Demo experience;
- new Task/Schedule capability → representative Demo example;
- new Dashboard KPI → synthetic Demo KPI;
- new Report/filter/metric → synthetic Demo reporting equivalent;
- new Property/Work Area feature → representative Demo example;
- new role/permission behavior → Demo role simulator equivalent;
- new QR/public-web feature → fake Demo QR equivalent where applicable;
- UI/layout/theme change → apply appropriately to both workspace modes.

Intentional exceptions include:

- real database writes;
- real evidence capture;
- mobile execution;
- billing/authentication;
- destructive actions;
- other persistent operational writes.

For an intentional exception, provide a read-only/synthetic/educational Demo equivalent rather than silently omitting the feature.

This is a standing architecture rule.

---

## 21. Demo Data Architecture

Demo uses:

- versioned static master data;
- deterministic synthetic operational activity;
- no per-tenant clone;
- no accumulating fake occurrence/evidence/audit/report records.

Synthetic activity must remain internally consistent across Dashboard, Reports, Schedules and Demo QR.

Relative activity should include realistic conditions such as:

- completed on time;
- completed late;
- late start;
- in progress;
- upcoming;
- missed;
- partial/incomplete;
- evidence follow-up;
- reported work;
- unusual duration;
- overdue maintenance;
- production delay/QC hold.

---

## 22. Demo Reference Properties

Current universal Demo includes:

1. **Grand Vista Hotel** — Hospitality
2. **FreshBite Foods Manufacturing Plant** — Food Manufacturing
3. **Industrial Maintenance Facility** — Maintenance
4. **Corporate Headquarters** — Corporate Office

Food Manufacturing includes two realistic lot-production examples:

### Butter Chicken Bowl — Lot Production

Representative tasks include:

- pre-op sanitation / line clearance;
- ingredient verification;
- staging;
- batching/cooking;
- temperature/quality check;
- filling/portion;
- sealing;
- metal detection;
- labeling;
- packaging;
- sanitation;
- lot closeout.

### Delight Cookies — Lot Production

Representative tasks include:

- pre-op/allergen clearance;
- ingredient verification/weighing;
- mixing;
- forming;
- baking;
- cooling;
- inspection/QC;
- metal detection;
- packaging;
- labeling;
- lot closeout.

Maintenance examples include Preventive Maintenance and Breakdown Maintenance.

---

## 23. Demo Workspace Batch 01 — VERIFIED GREEN

Demo Workspace Batch 01 is deployed on V2 and validated.

Implemented:

- real/Demo Workspace switcher;
- persistent Demo branding/banner;
- Demo navigation;
- Demo Dashboard;
- Demo Properties;
- Demo Work Areas;
- Demo Tasks;
- Demo Schedules;
- Demo Team;
- Demo Organization;
- Demo Reports;
- deterministic synthetic activity;
- public fake Demo QR;
- role simulator UI;
- safe Demo Task → real Task template-prefill flow.

### Task template bridge

Only Tasks may transfer from Demo to a real Organization.

Current safe flow:

`Use this Task as a template`

This opens normal real Task creation with Demo fields prefilled.

Nothing is written until an authorized Admin/Property Manager reviews and saves through the normal Task API/security/audit path.

**Schedules must not be copied from Demo into a real Organization.**

### Demo QR

Demo Work Areas use fake/public Web QR pages.

They:

- show Property/Work Area;
- clearly identify sample data;
- show deterministic synthetic service/history;
- do not create real `QrCode` rows;
- do not support mobile execution.

Public route:

`/demo-qr/[id]`

---

## 24. Known Demo Batch 01 Limitations

These are known follow-up items, not regressions:

1. **Zero-real-Organization access**
   - Current Demo protected layout still requires an authenticated user with an active real membership.
   - A user with no real Organization membership is redirected to onboarding.
   - Product intent favors allowing authenticated zero-Organization users to enter Demo.
   - This should be fixed in a subsequent Demo batch.

2. **Role simulator depth**
   - The current `View as Admin | Property Manager | User` control is educational/visual.
   - It does not yet materially change all page rendering/navigation/data perspective.
   - Future Demo screens should make the simulated role perspective functional while never touching real session permissions.

3. **Reports filters**
   - Demo Reports are synthetic and functional, but richer filtering should evolve in parity with real Reports.

4. **Detail-page parity**
   - Additional deep detail experiences should be added as the real application evolves.

---

# Security / RLS

## 25. Application-Layer Tenant Security

Current tenant protection is implemented at the application/backend layer.

Critical rule:

> Validate membership in the target Organization before applying role/authorization shortcuts.

`requireMembership(organizationId)` is the primary pattern.

Property Manager/User scope must remain assignment-aware.

Cross-tenant regression coverage is part of the permanent E2E suite.

---

## 26. RLS Design

Supabase RLS is a production-hardening objective, but it is deliberately sequenced.

Do **not** simply enable RLS on current business tables.

Reasons:

- runtime Prisma role may bypass RLS;
- a non-bypass role without request context would return no data/fail;
- pooled connections require transaction-local tenant context;
- application auth does not use Supabase `auth.uid()`;
- background/public/cron/test paths need deliberately scoped access.

Canonical design document:

`RLS-DESIGN-v1.md`

Planned runtime roles:

- `edekhbhal_migrator` — privileged migration role, never application runtime;
- `edekhbhal_app` — runtime role, NO BYPASSRLS;
- optional narrowly scoped service role/procedures.

Transaction-local settings:

- `app.user_id`
- `app.organization_id`
- `app.membership_id`
- `app.role`

Use `set_config(..., true)` inside transactions.

---

## 27. RLS Runtime Foundation — VERIFIED

The transaction-context foundation is implemented and covered by E2E.

Verified behavior includes:

- tenant context visible inside its transaction;
- Admin/PM contexts independent;
- fresh transactions do not inherit prior context;
- transaction-local context does not leak.

The suite includes three RLS runtime foundation tests.

**RLS remains disabled on business tables.**

Current gate:

> RLS is deliberately not enabled yet. First migrate tenant-sensitive application paths to transaction-aware context, complete runtime/bootstrap/service/public-QR handling, then introduce RLS in staging with an appropriate non-bypass runtime role/request context before production readiness.

Do not enable RLS merely because the context wrapper tests are green.

---

# Automated Testing / Deployment

## 28. E2E Environment

Protected E2E variables:

- `E2E_TEST_SECRET`
- `E2E_ADMIN_EMAIL`
- `E2E_PM_EMAIL`
- `E2E_USER_EMAIL`
- `E2E_UNASSIGNED_EMAIL`

E2E server endpoints require:

- `E2E_TESTING_ENABLED=true`;
- exact allowed `APP_URL`;
- correct secret header;
- explicit test identities.

Allowed E2E targets include:

- `https://edekhbhal-staging.vercel.app`
- `https://edekhbhal.vercel.app`

Playwright defaults to the V2 URL and rejects unrelated targets.

Secrets must never be committed to GitHub or this file.

---

## 29. GitHub Actions

Existing staging workflow:

`.github/workflows/e2e-staging.yml`

V2 workflow:

`.github/workflows/e2e-v2.yml`

The V2 workflow:

1. checks out the selected branch;
2. uses Node.js 24;
3. runs `npm ci`;
4. generates Prisma Client;
5. runs TypeScript typecheck;
6. installs Chromium/system dependencies;
7. runs focused Demo Workspace E2E;
8. runs the complete V2 E2E suite;
9. uploads Playwright report artifact.

The workflow definition may also exist on the repository default branch so GitHub exposes `workflow_dispatch` in the Actions UI, while the run itself is explicitly launched against `v2-rebuild`.

---

## 30. Verified V2 Regression Baseline — 2026-09-01

GitHub Actions run:

`33472542332`

Branch:

`v2-rebuild`

Commit:

`dd02d76449f658a9bd40bbf60792fc19b946871c`

Verified:

- Prisma Client generation — PASS
- TypeScript check — PASS
- Demo Workspace focused suite — **5/5 PASS**
- Complete V2 suite — **41/41 PASS**
- Playwright artifact upload — PASS

The complete 41-test suite covers the active baseline including:

- Audit;
- cross-tenant isolation;
- Demo Workspace;
- fine-tuning UI;
- mobile queue authorization;
- V2 public landing;
- Schedule Work Area QR;
- public QR privacy;
- property access;
- reported work;
- RLS transaction-context foundation;
- key smoke/profile flows.

This 41/41 result is the current canonical regression baseline.

---

## 31. Current Build / Prisma Notes

Canonical Prisma schema:

`prisma/schema.prisma`

Build/generation commands must explicitly use this schema.

Supabase pooled Prisma URL must retain:

`?pgbouncer=true&connection_limit=1`

This avoids prepared-statement conflicts with the Supabase transaction pooler.

Prisma remains on the tested 6.19.x line. Do not perform an unplanned major upgrade merely because the CLI advertises a newer major release.

---

## 32. Current Important Environment Variables

Web/server variables include, as applicable:

- `DATABASE_URL`
- `APP_URL`
- `AUTH_SECRET`
- `CRON_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `EVIDENCE_BUCKET`
- `MOBILE_DEV_AUTH_ENABLED`
- translation provider variables
- E2E variables listed above

Never record secret values in this file.

Correct V2 `APP_URL`:

`https://edekhbhal.vercel.app`

Do not prefix the value with `APP_URL=`.

---

## 33. Current Production-Hardening Items

Important remaining work includes:

- complete tenant-context migration of sensitive DB paths;
- enable RLS only after the runtime/security gate is satisfied;
- production-grade object storage for any remaining Base64/data-URL assets;
- production outbound authentication email/deep-link experience;
- holiday/exception calendars if required;
- subscription/billing implementation when explicitly designed;
- continued privacy review of public QR;
- broader mobile/native-device automation where practical;
- dependency vulnerability review without forcing breaking upgrades blindly.

---

## 34. Current Immediate Next Steps

### Demo Workspace Batch 02

Priorities:

1. Allow authenticated users with **zero real Organization memberships** to enter Demo Workspace.
2. Make the Demo role simulator materially change the educational role perspective while never changing real authorization/session state.
3. Improve Demo Reports/filter/detail parity with the current real application.
4. Add deeper Demo detail pages where useful.
5. Continue enforcing the standing Demo parity rule for every new real feature.

### RLS track

Continue the deliberately sequenced tenant-context migration. Do **not** enable RLS yet.

The next RLS migration candidates should be selected only after inspecting the latest branch, with preference for clean, isolated tenant-sensitive DB paths before global occurrence/bootstrap/service flows.

---

## 35. Release / Regression Rule

For every future functional increment:

`Requirement → implementation → automated test coverage → full regression → PROJECT-CONTEXT update`

Do not treat a feature as complete merely because it compiles.

For changes that affect real Organization Workspace behavior, explicitly evaluate Demo Workspace parity in the same batch.

---

## 36. How to Resume in a New Conversation

Use this instruction:

> Continue the eDekhbhal project. Read `PROJECT-CONTEXT.md` from the `v2-rebuild` branch first. It is the canonical project context. Then inspect the current `v2-rebuild` code before making changes. Continue from Current Status / Next Steps and preserve all existing architectural and business-rule decisions.

Also remember:

- development branch is `v2-rebuild`;
- V2 URL is `https://edekhbhal.vercel.app`;
- current E2E baseline is **41/41**;
- Demo focused baseline is **5/5**;
- RLS is **not enabled**;
- every real feature change must evaluate/implement Demo parity.

---

# End of Canonical Context

When this document conflicts with older chat text or obsolete repository notes, this latest dated canonical context and the latest verified `v2-rebuild` code take precedence unless the product owner explicitly changes a decision.

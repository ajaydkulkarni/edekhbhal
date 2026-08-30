# eDekhbhal — Project Context, Functional Brief & Continuity Notes

> **Purpose of this file**
>
> This is the canonical continuity document for the eDekhbhal project. It summarizes the product vision, functional requirements, architecture decisions, permissions, current implementation, environment/deployment notes, version history, known limitations, and the agreed roadmap.
>
> **Use this file whenever development resumes in a new ChatGPT conversation, on another computer, or after a long gap.**
>
> Going forward, this file should be updated with every build/release and kept in the root of the GitHub repository as `PROJECT-CONTEXT.md`.

**Last updated:** 2026-08-29
**Current application version:** v0.9.1 (Direct Work Area QR Visibility Hotfix)
**Current deployment status:** v0.9.1 remains the application version. Fine-tuning Batch 02A corrects E2E runtime enablement for the dedicated staging Vercel project and installs Chromium system dependencies for Codespaces. E2E endpoints are gated by E2E_TESTING_ENABLED, the staging APP_URL, the E2E secret and explicit test emails. RLS remains deferred until role/security E2E regression is green.
**Current GitHub deployment commit observed in successful Vercel build:** `9c24f7a`

**Current Android field build:** v0.8.1, versionCode 3, EAS build `55db02b1-76dd-4e86-9f73-db97be2a17c7`, source commit `ad4ea3bf21658583c07843d6569b09e174459316`.

---

## 1. Product Vision

**eDekhbhal** is a multi-tenant, subscription-based SaaS application for managing properties, work areas, operational tasks, recurring/one-time schedules, mobile task execution, evidence capture, supervision, auditability, and eventually analytics/performance monitoring.

The system is being designed so that an Organization can:

1. Register users.
2. Manage Properties.
3. Define Work Areas within Properties.
4. Create reusable organization-level Tasks.
5. Create Schedules that associate Tasks with Work Areas.
6. Pre-generate Schedule Occurrences for upcoming work.
7. Allow mobile users to execute the work.
8. Capture actual start/end time, actual duration, photos/videos, and other evidence.
9. Allow supervisors to monitor execution in near-real-time.
10. Maintain a complete audit trail of every relevant action.

The application must remain strongly tenant-scoped: users can only operate within organizations to which they belong.

---

## 2. Current Infrastructure

### GitHub

Repository:

`ajaydkulkarni/edekhbhal`

Main deployment branch:

`main`

Vercel automatically deploys the GitHub `main` branch.

### Vercel

Staging URL:

`https://edekhbhal-staging.vercel.app/`

Vercel project:

`edekhbhal-staging`

Current important environment variables:

- `DATABASE_URL`
- `APP_URL`
- `AUTH_SECRET`
- `CRON_SECRET`

**Never place secret values in this file or commit them to GitHub.**

The Supabase pooled database URL used by Prisma must retain:

`?pgbouncer=true&connection_limit=1`

This avoids Prisma/PostgreSQL prepared-statement conflicts when using the Supabase transaction pooler.

### Supabase

Project URL:

`https://txhczujjpmcqbwpwgwad.supabase.co`

Staging project name:

`edekhbhal-staging`

Supabase is currently being used primarily as PostgreSQL hosting. Authentication is currently application-managed rather than Supabase Auth.

The application currently uses application/backend tenant authorization. Full database Row Level Security should be considered before production.

### Technology Stack

- Next.js 15.5.x
- React 19
- TypeScript
- Prisma 6.19.x
- PostgreSQL / Supabase
- Vercel
- Zod
- QR code generation
- Custom email/magic-link-style authentication flow

---

## 3. Authentication

### Registration

Registration captures only:

- Email address

### Login

Authentication uses an email/magic-link-style flow.

Current staging behavior:

- `/api/auth/request-link`
- `/api/auth/verify`
- `MagicLinkToken`
- `Session`
- httpOnly session cookie: `edk_session`

Real outbound email is not yet connected, so staging may expose/use a development authentication link.

### Auth audit events

Examples include:

- `MAGIC_LINK_REQUESTED`
- `LOGIN`
- `LOGIN_FAILED`
- `LOGOUT`

---

## 4. Organization

After authentication, a user can create an Organization.

Organization fields include:

- Organization Name
- Logo
- Address Line 1
- Address Line 2
- Address Line 3
- City
- State
- Zip / PIN / Postal Code
- Country
- Timezone
- Working Hours

The user who creates the Organization automatically becomes its `ADMIN`.

### Organization Name immutability

**Organization Name must never be changed after creation.**

Current enforcement is at the application/API level: the Organization settings update API does not permit changing the name.

A future production-hardening option is to enforce this in the database as well.

### Organization logo

Logo upload/display is supported.

Current staging implementation stores the logo as a data URL in `Organization.logoUrl`.

For production, move organization logo files to Supabase Storage or another object-storage service.

### Organization Working Hours

Organization working hours are the top-level default.

- If Organization working hours are `null`, the Organization is treated as **24×7 / unrestricted**.
- Multiple daily working windows are supported.
- Overnight windows such as `22:00–06:00` are supported.
- Closed days are represented by no windows for that weekday.

---

## 5. Roles & Permissions

Current roles:

- `ADMIN`
- `PROPERTY_MANAGER`
- `USER`

### High-level permission policy

| Function | ADMIN | PROPERTY_MANAGER | USER |
|---|---:|---:|---:|
| Organization settings | Yes | No | No |
| Team/user management | Yes | No | No |
| Property create/edit/status | Yes | Yes | View/use as applicable |
| Work Area create/edit/status | Yes | Yes | View/use as applicable |
| Task create/edit/status | Yes | Yes | Read-only |
| Schedule create/edit/status | Yes | Yes | Read-only / future execution |
| Duplicate Schedule | Yes | Yes | No |
| Reorder Schedule Tasks | Yes | Yes | No |
| Change evidence rules | Yes | Yes | No |
| Audit trail access | Supported according to current app navigation/authorization |
| Mobile execution | Future module |

### Team management

Admin can:

- Add/invite users by email.
- Assign `ADMIN`, `PROPERTY_MANAGER`, or `USER`.
- Change roles of other members.
- Inactivate/reactivate membership.

Current safety rule:

- A user cannot change their own role/status through the Team UI/API.

Membership inactivation does not globally delete/inactivate the underlying `User` record.

---

## 6. Properties

A Property belongs to an Organization.

Fields include:

- Name
- Address
- Timezone
- Working Hours
- Status

### Address inheritance

When creating a Property, the Organization address is used as a **prefill/default**.

The Property stores its own copied values.

Organization address changes do **not** silently update existing Property addresses.

### Property lifecycle

Properties use soft state:

- `ACTIVE`
- `INACTIVE`

No destructive delete should be used for normal business operation.

Existing historical/audit/QR relationships must be preserved.

### Property Working Hours

A Property can:

- Inherit Organization working hours, or
- Override them.

Current implementation:

- `Property.workingHours = null` means **inherit Organization**.

---

## 7. Work Areas

A Work Area belongs to a Property.

Fields include:

- Name
- Description
- Physical location identifier, e.g. `"2nd floor"`
- Working Hours
- Status

The parent Property name should always be visible when Work Areas are displayed.

Standalone Work Area creation must include a Parent Property selector.

### Work Area lifecycle

Soft state:

- `ACTIVE`
- `INACTIVE`

### Work Area Working Hours

A Work Area can:

- Inherit its Property working hours, or
- Override them.

Current implementation:

- `WorkArea.workingHours = null` means **inherit Property**.

### Effective Working Hours

The effective rule is:

`Work Area override → Property override → Organization default`

Occurrence generation uses the effective Work Area hours.

---

## 8. QR Codes

Each Work Area has QR functionality.

Supported actions:

### Reprint

Reprint outputs the current active QR.

It does **not** change QR identity.

### Regenerate

Regenerate:

1. Revokes the current QR.
2. Creates a new QR.
3. Keeps the new QR associated with the same Work Area.
4. Makes the old QR invalid.

QR actions are audit-trailed.

Current QR public route uses a database QR record identifier rather than relying on storing/recovering the original raw secret token.

---

## 9. Tasks Module — v0.4.0

Tasks are **Organization-level reusable definitions**.

They do **not** belong directly to a Property or Work Area.

This is intentional because the Schedule module later associates a Task with individual Work Areas.

### Task fields

#### Task Name

- Can accommodate a complete sentence.
- Current database size: up to 500 characters.

#### Task Description

Rich-text instructions.

Supports the intended formatting capabilities such as:

- Bold
- Italics
- Underline
- Paragraphs
- Lists
- Font sizing / rich formatting as supported by the editor

Stored as HTML in:

`Task.descriptionHtml`

#### Attachments

Tasks support multiple attachments.

Desired behavior:

- Images/drawings show visual thumbnails.
- PDFs/text may provide inline/representative previews.
- Unsupported preview types show file metadata/type tiles.

### Current attachment storage limitation

Current staging implementation stores Task attachments in PostgreSQL as Base64:

`TaskAttachment.contentBase64`

This was intentionally done to avoid adding object-storage configuration during early staging.

**This is not the intended production architecture.**

Production should move attachment content to Supabase Storage/object storage and store metadata/path/thumbnail references in PostgreSQL.

### Task permissions

Only:

- `ADMIN`
- `PROPERTY_MANAGER`

may create/edit/inactivate/reactivate Tasks.

`USER` is read-only.

### Task lifecycle

- `ACTIVE`
- `INACTIVE`

### Task audit events

Current events include:

- `TASK_CREATED`
- `TASK_UPDATED`
- `TASK_INACTIVATED`
- `TASK_REACTIVATED`
- `TASK_ATTACHMENT_ADDED`
- `TASK_ATTACHMENT_REMOVED`

---

## 10. Schedules Module — v0.5.0 / v0.5.1

Schedules are the core planning engine.

A Schedule is organization-scoped and associates:

- One Work Area
- One or more reusable organization Tasks
- A timing/recurrence definition
- Per-Task planned duration
- Per-Task evidence rules
- Task sequence/order

Only `ADMIN` and `PROPERTY_MANAGER` may create/edit/duplicate/inactivate/reactivate or otherwise modify Schedule definitions.

`USER` cannot modify Schedule definitions.

### Schedule fields

1. **Schedule Name**
2. **Schedule Frequency**
3. **Schedule Start Date/Time**
4. **Recurring End Date**
5. **Work Area**
6. **One or more Tasks**
7. **Per-Task Duration**
8. **Per-Task Evidence Rule**
9. **Calculated Task Start/End**
10. **Task Sequence / Reordering**

---

## 11. Schedule Frequency

Two schedule modes:

- `ONE_TIME`
- `RECURRING`

Recurring schedule units currently supported:

- Minute
- Hour
- Day
- Week
- Month
- Year

The recurrence builder supports patterns such as:

- Every 5 minutes
- Every 15 minutes
- Every 2 hours
- Every day
- Every 3 days
- Every N weeks
- Selected weekdays for weekly recurrence
- Every N months on selected calendar day(s)
- Every N years

This avoids requiring end users to understand cron syntax.

### Weekly recurrence

Can specify selected weekdays.

Example:

`Every 2 weeks on Monday, Wednesday, Friday`

### Monthly recurrence

Can specify one or more calendar days.

Example:

`Every month on day 1, 15, 30`

---

## 12. Schedule Start & End Dates

### Start

`Schedule.startAt` stores the first schedule date/time.

Timezone is stored explicitly on the Schedule.

### Recurring End Date

Recurring Schedules have an optional End Date.

Example:

- Start: `2026-09-01 08:00`
- End Date: `2026-12-31`

The final End Date remains eligible through **11:59 PM / end of calendar day in the Schedule timezone**.

A blank End Date means no date-based recurrence end.

One-time schedules do not require an End Date.

---

## 13. Schedule Work Area

Each Schedule selects one Work Area.

The dropdown should display:

`Work Area Name — Parent Property Name`

Only active Work Areas under active Properties should be selectable for a new Schedule.

The Work Area/Property timezone is used for schedule interpretation.

---

## 14. Schedule Tasks

A Schedule contains one or more `ScheduleTask` records.

Each stores:

- Task
- Sequence
- Planned duration
- Planned start offset
- Planned end offset
- Evidence rule
- Random evidence configuration

### Duration

Captured strictly in:

`HH:MM`

Example:

`00:30`

Duration is converted internally into minutes.

Duration must be greater than `00:00`.

### Automatic timing

The first Task starts at the Schedule start time.

Every next Task starts when the previous Task ends.

Example:

```text
Schedule starts 09:00

Task 1  00:20   09:00–09:20
Task 2  00:35   09:20–09:55
Task 3  00:10   09:55–10:05

Total planned duration: 01:05
Schedule end: 10:05
```

### Reordering

Users can reorder Tasks.

Whenever a Task is moved or its duration changes:

- Sequence numbers change.
- Planned Task start/end times recalculate.
- Total planned Schedule duration recalculates.
- Schedule planned end recalculates.

---

## 15. Evidence Rules

Evidence is configured on the **ScheduleTask association**, not on the Task master.

That allows the same Task to have different evidence requirements in different Work Areas/Schedules.

Supported rules:

- `NONE`
- `PHOTO`
- `VIDEO`
- `RANDOM`

### Photo / Video

`PHOTO` means a photo is required for every performance.

`VIDEO` means a video is required for every performance.

### Random Evidence — Important Definition

**Random does NOT mean randomly choose Photo vs Video on every execution.**

Random means:

> Evidence is required only on a random subset of Task performances.

Example:

`1 in every 3 performances`

or:

`1 in every 4 performances`

The Schedule Task stores:

- `randomEveryN`
- `randomEvidenceType`

Random evidence type may be:

- `PHOTO`
- `VIDEO`
- `EITHER`

### Random sampling design

The execution/generation model is designed so that for `1 in N`, one occurrence in each block of N performances is selected.

This avoids an independent `Math.random() < 1/N` implementation that could accidentally create long stretches with no evidence request.

The current occurrence generator uses a deterministic pseudo-random selection within each block of N for reproducibility and auditability.

When an occurrence is generated, the random rule is resolved into concrete occurrence fields:

- `evidenceRequired = true/false`
- `evidenceTypeRequired = PHOTO/VIDEO/EITHER/null`

The mobile client should therefore consume the decision, not decide it itself.

---

## 16. Schedule Lifecycle

Schedules support:

- Create
- View
- Edit
- Duplicate
- Inactivate
- Reactivate

Soft state:

- `ACTIVE`
- `INACTIVE`

A duplicate copies the Schedule definition and ordered Schedule Tasks.

---

## 17. Working-Hours-Aware Scheduling

Working hours are designed as an inheritance hierarchy:

```text
Organization Working Hours
        ↓
Property Working Hours
        ↓
Work Area Working Hours
```

Lower levels can inherit or override.

### Multiple windows

Multiple working windows per day are supported.

Example:

```text
Monday
08:00–12:00
13:00–17:00
```

### Overnight windows

Supported.

Example:

`22:00–06:00`

### Occurrence eligibility rule

A Schedule occurrence is created only when the **entire planned Schedule duration fits within an effective open working-hours window**.

Example:

- Work Area closes at 17:00
- Schedule duration = 01:30
- Candidate start = 16:00
- Candidate end = 17:30

Result:

**Do not generate the occurrence.**

The generator should not create work that knowingly runs beyond closing time.

### Future enhancement

Holiday calendars, exceptional closures, and date-specific overrides are not yet implemented but should layer on top of the working-hours model.

---

## 18. Why Occurrence Pre-Generation Is Used

We explicitly decided **not** to fire a cron every minute for every due Schedule.

Instead, the system pre-generates upcoming Schedule occurrences.

Key insight:

> A Schedule can recur every 5 minutes without the cron itself running every 5 minutes.

A batch process can generate all upcoming 5-minute occurrences ahead of time.

Benefits:

- Lower scheduler overhead
- Better resilience
- Future workload visibility
- Supervisor dashboard can see planned work in advance
- Mobile client can query already-created work
- Easier missed-work detection
- Better auditability

---

## 19. Rolling Occurrence Generator

Current design:

- One protected batch endpoint
- Intended to run around 3 times per day
- Generates/reconciles a rolling **48-hour horizon**
- New/edit Schedule operations also trigger immediate reconciliation

Current endpoint:

`GET /api/cron/schedule-occurrences`

Authorization:

`Authorization: Bearer <CRON_SECRET>`

`CRON_SECRET` is configured in Vercel as a secret environment variable.

**Never store the secret itself in GitHub or this file.**

### Current cron activation state

The endpoint is implemented and successfully built.

However, the package intentionally includes:

`vercel-cron.example.json`

rather than automatically activating a `vercel.json` cron.

Example intended cadence:

- 00:15 UTC
- 08:15 UTC
- 16:15 UTC

The reason was to avoid assuming a Vercel plan supports that cron frequency/cadence.

### Current immediate behavior

Even before activating the batch cron:

- Creating a Schedule triggers occurrence generation/reconciliation.
- Editing a Schedule triggers future occurrence reconciliation.

Therefore the occurrence engine can be tested before activating the scheduled cron.

---

## 20. Schedule Occurrence Architecture — v0.5.1

Instead of a single generic `ScheduleHistory` table, the agreed design separates the planned occurrence from actual task execution.

Relationship:

```text
Schedule
   │
   └── ScheduleOccurrence
          │
          └── ScheduleOccurrenceTask
                 │
                 └── ScheduleOccurrenceEvidence
```

This model is foundational for the future mobile and Supervisor Dashboard modules.

---

## 21. ScheduleOccurrence

One `ScheduleOccurrence` represents one planned firing/performance of a Schedule.

Important fields currently include:

- Organization
- Schedule
- Work Area
- Scheduled Start
- Scheduled End
- Timezone
- Schedule Name snapshot
- Work Area Name snapshot
- Property Name snapshot
- Planned total duration
- Status
- Generated timestamp
- Started timestamp
- Completed timestamp

### Uniqueness

Database uniqueness:

`Schedule ID + Scheduled Start Date/Time`

This makes occurrence generation idempotent.

If the generator runs more than once for the same horizon, duplicate occurrences should not be created.

### Occurrence statuses

Current enum:

- `PENDING`
- `IN_PROGRESS`
- `COMPLETED`
- `PARTIALLY_COMPLETED`
- `MISSED`
- `CANCELED`

---

## 22. ScheduleOccurrenceTask

Each generated occurrence snapshots its ordered Tasks.

Important fields include:

- Source Task ID
- Sequence
- Task Name snapshot
- Task Description snapshot
- Planned duration
- Planned Start
- Planned End
- Evidence rule snapshot
- Evidence required?
- Evidence type required
- Status
- Actual Start
- Actual End
- Actual Duration

### Why snapshots are mandatory

A Task or Schedule may be edited after an occurrence has already been generated.

Historical/operational expectations must not silently change retroactively.

Example:

- 08:00 occurrence generated with 20-minute Task duration
- At noon, Admin changes Task duration to 30 minutes

The already-generated 08:00 occurrence must retain the original 20-minute plan.

### Occurrence Task statuses

Current enum:

- `PENDING`
- `IN_PROGRESS`
- `COMPLETED`
- `SKIPPED`
- `FAILED`
- `MISSED`

---

## 23. ScheduleOccurrenceEvidence

This table is the future mobile evidence foundation.

Current fields include:

- Occurrence Task
- Type (`PHOTO` or `VIDEO`)
- Storage path
- Thumbnail path
- MIME type
- Size
- Captured At
- Captured By
- Metadata

The actual mobile evidence files should live in object storage such as Supabase Storage.

Only metadata/path references should live in PostgreSQL.

---

## 24. Future Mobile Execution Flow

The future mobile module should operate on generated Occurrences, **not** directly on the Schedule master.

Expected flow:

```text
Worker opens/scans Work Area
        ↓
Application finds current/due ScheduleOccurrence
        ↓
Worker sees ordered ScheduleOccurrenceTasks
        ↓
Task starts
        ↓
Actual Start captured
        ↓
Task completed
        ↓
Actual End / Actual Duration captured
        ↓
If evidenceRequired = true:
    require photo/video as defined
        ↓
Evidence uploaded
        ↓
Occurrence progress/status updated
```

Future mobile data should include:

- Actual Task Start
- Actual Task End
- Actual Task Duration
- Completion status
- Evidence
- User/worker
- Capture timestamps
- Optional device metadata
- Potential location/device integrity signals later

---

## 25. Supervisor Dashboard Vision

The supervisor should eventually be able to see operational performance in near-real time.

Example:

```text
Property      Work Area       Schedule         Progress
-------------------------------------------------------
HQ            Conference A    Morning Clean    4 / 6
HQ            Lobby           Lobby Clean      8 / 8
Warehouse     Bay 2           Safety Check     3 / 7
```

Expected operational categories:

- Not Started
- In Progress
- On Time
- Running Late
- Completed
- Partially Completed
- Missed

Occurrence detail should compare:

- Planned Start vs Actual Start
- Planned End vs Actual End
- Planned Duration vs Actual Duration
- Evidence requirement vs submission
- Task status
- Worker/user
- Captured evidence

This is the primary reason Occurrence/OccurrenceTask records are separate from Schedule definitions.

---

## 26. Reconciliation Rules

When a Schedule or relevant working-hours configuration changes:

### Future `PENDING` occurrences

May be reconciled/regenerated to reflect the new definition.

### `IN_PROGRESS` occurrences

Do **not** automatically rewrite.

### Completed/historical occurrences

Never rewrite.

This preserves operational integrity and audit history.

Working-hour edits at Organization, Property, or Work Area level can trigger reconciliation of affected future Schedules/Occurrences.

---

## 27. Occurrence Generation Decision Flow

Current conceptual logic:

```text
Is Schedule ACTIVE?
        ↓
Is Property ACTIVE?
        ↓
Is Work Area ACTIVE?
        ↓
Is candidate within Schedule Start / End dates?
        ↓
Does recurrence rule match?
        ↓
Resolve effective Working Hours
        ↓
Does the full planned Schedule fit inside an open window?
        ↓
Has this occurrence already been generated?
        ↓
Resolve per-Task random evidence decisions
        ↓
Create ScheduleOccurrence
        ↓
Create ScheduleOccurrenceTasks
```

---

## 28. Audit Trail — System-Wide Requirement

Auditability is a core requirement across the application.

The user does **not** need to restate "audit this" for every future module.

Every meaningful action should capture as appropriate:

- Organization
- User
- Action
- Result
- Entity Type
- Entity ID
- Old Value
- New Value
- Metadata
- IP address
- User agent
- Request ID
- Timestamp

`AuditLog` is append-only/immutable. Database protections were introduced earlier to prevent normal update/delete mutation.

### Current Schedule-related events

Examples:

- `SCHEDULE_CREATED`
- `SCHEDULE_UPDATED`
- `SCHEDULE_INACTIVATED`
- `SCHEDULE_REACTIVATED`
- `SCHEDULE_DUPLICATED`
- `SCHEDULE_OCCURRENCES_GENERATED`
- `SCHEDULE_OCCURRENCES_RECONCILED`

Schedule edit audit snapshots contain the ordered Schedule Task configuration, enabling additions/removals/reordering/duration/evidence changes to be reconstructed.

### Future execution audit

Mobile/execution should audit events such as:

- Task started
- Task completed
- Task skipped
- Task failed
- Occurrence started
- Occurrence completed
- Evidence required decision
- Evidence submitted
- Evidence replaced/removed if allowed
- Actual-duration changes
- Supervisor corrections/overrides
- Missed-work classification

---

## 29. Subscription Foundation

The application contains:

- `Plan`
- `Subscription`

Seeded plan concepts historically included:

- Starter
- Professional
- Enterprise

Subscription enforcement is still a foundation rather than the current core focus.

---

## 30. Current Prisma Data Model Summary

Current major models:

- `User`
- `Session`
- `MagicLinkToken`
- `Organization`
- `OrganizationMember`
- `Property`
- `WorkArea`
- `QrCode`
- `Task`
- `TaskAttachment`
- `Schedule`
- `ScheduleTask`
- `ScheduleOccurrence`
- `ScheduleOccurrenceTask`
- `ScheduleOccurrenceEvidence`
- `Plan`
- `Subscription`
- `AuditLog`

---

## 31. Current Version History

### v0.2.x

Established:

- Authentication
- Organization onboarding
- Property
- Work Area
- QR lifecycle
- Audit
- Subscription foundation

Important QR behavior:

- Reprint current QR
- Regenerate revokes prior QR and creates a new one

### v0.3.0

Added/refined:

- User profile
- Team/User management
- Organization settings
- Organization Name immutability in update flow
- Logo
- Property edit/inactivate/reactivate
- Work Area edit/inactivate/reactivate
- Parent Property visibility
- Property address prefill from Organization
- Role management

### v0.4.0

Added:

- Organization-level Tasks
- Rich-text Task Description
- Task attachments/previews
- Task lifecycle
- Task audit events
- Admin/Property Manager Task modification
- User read-only Task access

### v0.5.0

Added:

- Schedules
- One-time / recurring recurrence builder
- Minutes/hours/days/weeks/months/years
- Selected weekly days
- Selected monthly days
- Work Area selector
- Multiple Tasks
- Strict HH:MM duration
- Automatic planned start/end calculation
- Reordering
- Evidence configuration
- Random evidence `1 in N`
- Schedule lifecycle
- Schedule duplication
- Schedule audit

### v0.5.1

Added:

- Recurring End Date
- Hierarchical Working Hours
- Organization/Property/Work Area inheritance
- Split working windows
- Overnight working windows
- Full-duration-fit validation
- `ScheduleOccurrence`
- `ScheduleOccurrenceTask`
- `ScheduleOccurrenceEvidence`
- 48-hour rolling generator
- Immediate reconciliation on Schedule create/edit
- Protected cron endpoint
- Random evidence concrete decision at occurrence generation
- Upcoming Generated Occurrences UI
- Occurrence generation/reconciliation audit events

### v0.5.2

Added:

- Staging-only Admin Demo Data page/API
- Canonical idempotent demo seed available from deployed Vercel app
- 6 users, 3 properties, 10 work areas, 15 tasks and 8 varied schedules
- `DEMO_DATA_ENABLED` staging safeguard
- Updated canonical `PROJECT-CONTEXT.md` release practice

### v0.6.0

Added:

- Web Logout
- Organization-configurable Schedule claim expiry
- Atomic USER occurrence claiming/release/expiry
- Work Area QR validation to start execution
- Server-authoritative Schedule and Task timers
- Sequential Task start/completion workflow
- Task-level and Schedule-level append-only notes
- Live camera-only photo/video evidence
- Private Supabase Storage signed-upload flow
- Mobile session APIs and USER queue
- Personal mobile performance report
- React Native/Expo Android+iOS project under `/mobile`
- Mobile audit events and v0.6.0 database migration

---

## 32. v0.5.1 Deployment Incident & Resolution

The first v0.5.1 Vercel build failed because three generated API files used invalid JavaScript/TypeScript syntax equivalent to:

```ts
if (condition) const value = ...;
```

Affected areas:

- Organization settings API
- Property API
- Work Area API

The corrected form uses braces:

```ts
if (condition) {
  const value = ...;
}
```

A corrected v0.5.1 package/hotfix was uploaded.

### Successful build

The subsequent Vercel build completed successfully.

Important successful build messages included:

- Prisma Client generated successfully
- Next.js compiled successfully
- Type checking completed
- Static pages generated
- Serverless functions created
- Deployment completed

The route list confirmed:

- `/api/cron/schedule-occurrences`
- `/schedules`
- `/schedules/new`
- `/schedules/[id]`

The npm `allow-scripts` messages were warnings only and were **not** the cause of the earlier failure.

---

## 33. Database Upgrade Files

Current repository/build history contains:

- `supabase-v0.3.0.sql`
- `supabase-v0.4.0.sql`
- `supabase-v0.5.0.sql`
- `supabase-v0.5.1.sql`

For staged upgrades, migrations should be run before testing functionality that depends on the new schema.

Current architecture continues to rely on backend tenant authorization; do not introduce RLS changes casually without reviewing application behavior.

---

## 34. Current v0.5.1 Validation Checklist

After deployment, validate:

### Organization Working Hours

- Save 24×7.
- Save restricted working hours.
- Refresh and confirm persistence.

### Property Working Hours

- Confirm inheritance from Organization.
- Override.
- Save and refresh.

### Work Area Working Hours

- Confirm inheritance from Property.
- Override.
- Save and refresh.

### Schedule

Create a recurring Schedule with:

- Start Date/Time
- End Date
- Work Area
- Multiple Tasks
- Durations
- Evidence rules
- Random evidence
- Reordered Tasks

Confirm:

- Planned Task times recalculate.
- Total duration recalculates.
- Schedule End recalculates.

### Occurrences

Open saved Schedule.

Confirm Upcoming Generated Occurrences:

- Are inside effective working hours.
- Do not extend beyond working-window close.
- Do not occur after recurring End Date.
- Respect recurrence.

### Reconciliation

Change:

- Schedule duration
- Task order
- Working hours

Confirm:

- Future PENDING occurrences reconcile.
- IN_PROGRESS / completed historical records are not rewritten.

### Audit

Confirm Schedule edit and occurrence generation/reconciliation entries appear.

---

## 35. Current Cron Status / Next Operational Step

`CRON_SECRET` has been created and saved in Vercel.

The protected cron route has successfully compiled/deployed.

**Automatic Vercel cron execution is not yet intentionally activated.**

Next operational decision:

1. Confirm v0.5.1 functionality in staging.
2. Confirm Vercel plan/cadence support.
3. Activate the three-times-daily occurrence generation schedule, or use an external scheduler if preferred.

The design preference remains:

- Approximately 3 batch runs/day
- 48-hour rolling generation horizon
- Immediate generation/reconciliation on Schedule create/edit

rather than a once-per-minute cron.

---

## 36. Known Current Limitations / Production Hardening Items

These are intentional or known staging limitations.

### Email

Real transactional email/magic-link delivery is not connected.

### Task attachments

Stored in PostgreSQL Base64 for staging.

Move to Supabase Storage/object storage before production.

### Organization logo

Currently stored as data URL.

Move to object storage before production.

### Occurrence evidence

Database model exists, but the mobile upload/execution workflow has not yet been built.

Use object storage for real photo/video evidence.

### Cron

Protected endpoint exists but scheduled Vercel invocation has not yet been activated.

### RLS

Application-layer tenant isolation is being used.

Full Supabase RLS should be considered before production.

### Organization Name

Currently immutable through application/API logic.

A database-level invariant may be added for production hardening.

### Holidays / exception calendars

Not yet implemented.

### Mobile module

Not yet implemented.

### Supervisor dashboard

Not yet implemented.

---

## 37. Agreed Future Roadmap

### Next major module: Mobile / Execution Engine

Build on:

- `ScheduleOccurrence`
- `ScheduleOccurrenceTask`
- `ScheduleOccurrenceEvidence`

Capabilities:

- Identify Work Area from QR
- Show currently due work
- Start occurrence/task
- Complete task
- Capture actual start/end/duration
- Enforce evidence when required
- Upload photo/video evidence
- Update statuses
- Handle skipped/failed/missed tasks
- Maintain audit trail

### Supervisor Dashboard

Real-time/near-real-time view by:

- Organization
- Property
- Work Area
- Schedule
- Worker
- Status

Metrics:

- Planned vs actual
- On-time/late
- Completion rate
- Evidence compliance
- Missed Tasks
- Actual duration vs expected duration

### Future scheduling refinements

Potential future items:

- Holiday calendars
- Exceptional closure dates
- Special working-hour overrides
- Temporary shutdowns
- More advanced recurrence expressions if business needs require them
- Capacity/overlap analysis
- Conflict detection
- Schedule versioning if needed

---

## 38. Architectural Principles That Should Be Preserved

Unless explicitly changed by the product owner, future development should preserve these decisions:

1. **Multi-tenant first.**
2. **Audit everything meaningful.**
3. **Use soft inactivation rather than destructive deletion.**
4. **Organization Tasks are reusable masters.**
5. **Schedules associate Tasks with Work Areas.**
6. **Actual execution belongs to Occurrences, not Schedule masters.**
7. **Historical occurrences must snapshot planned data.**
8. **Do not rewrite completed/in-progress history when definitions change.**
9. **Working hours inherit Organization → Property → Work Area.**
10. **Only generate work that completely fits inside effective working hours.**
11. **Random evidence means random performances require evidence, not random media type every time.**
12. **Resolve random evidence at occurrence generation, not on the mobile client.**
13. **Use batched rolling occurrence generation instead of a one-minute scheduler.**
14. **New/edited Schedules reconcile immediately.**
15. **Evidence files belong in object storage in production.**
16. **Admin and Property Manager control Task/Schedule definitions.**
17. **Users should not modify Schedule master definitions.**
18. **Organization Name is immutable after creation.**

---

## 39. How to Resume Development in a New ChatGPT Session

At the start of a new conversation:

1. Upload this file, or provide the repository containing `PROJECT-CONTEXT.md`.
2. Tell ChatGPT:
   > "Read `PROJECT-CONTEXT.md` first. This is the canonical context for the eDekhbhal project. Continue from the Current Status / Next Steps sections and preserve the architectural decisions."
3. If debugging a build, also provide:
   - The current ZIP/source if necessary
   - The Vercel build log
   - Any runtime error/screenshot
4. Do not share:
   - `CRON_SECRET`
   - `AUTH_SECRET`
   - Database password
   - Private API keys

---

## 40. Release Process Going Forward

For **every future build**, update this file before packaging.

At minimum update:

- `Last updated`
- `Current application version`
- `Current deployment status`
- Version History
- New functional requirements
- New architecture decisions
- New database models/migrations
- New environment variables
- New known limitations
- Current test status
- Next steps

Every release ZIP should contain:

`PROJECT-CONTEXT.md`

at the repository root.

This file should also be committed to GitHub so it is available independently of any ChatGPT conversation.

---

## 41. Current Immediate Next Step

The v0.5.1 build is successfully deployed.

The immediate task is **functional staging validation**, specifically:

1. Organization Working Hours
2. Property inheritance/override
3. Work Area inheritance/override
4. Recurring Schedule End Date
5. Task sequencing/timing
6. Random evidence settings
7. Upcoming ScheduleOccurrence generation
8. Working-hours filtering
9. End-Date filtering
10. Future PENDING reconciliation
11. Audit entries

After those tests pass:

**Activate the three-times-daily ScheduleOccurrence batch generator and then proceed to the Mobile Execution module.**

---


When this document conflicts with older chat text, the **latest dated section/build decision in this file** should be treated as the working project context unless the product owner explicitly changes it.
---

## 42. Demo / Staging Seed Data

A repeatable staging/demo seed script has been added as:

`prisma/seed-demo.ts`

Package command:

`npm run db:seed:demo`

The seed is deliberately protected by:

`DEMO_SEED_CONFIRM=YES`

It uses stable deterministic seed IDs and upserts only the eDekhbhal demo data. It does not delete unrelated Organizations or user data.

Current canonical demo dataset:

- 1 Organization: `eDekhbhal Demo Operations`
- 6 Users:
  - 1 `ADMIN`
  - 2 `PROPERTY_MANAGER`
  - 3 `USER` accounts
- 3 Properties
- 10 Work Areas
- Active QR records for all seeded Work Areas
- 15 Organization-level Tasks with rich-text instructions
- 8 Schedules covering one-time, minute, hour, daily, weekly and monthly patterns
- Photo, Video and Random `1 in N` evidence variations
- Professional Subscription
- Seed audit records
- Rolling 48-hour ScheduleOccurrence generation

On re-run, seeded Schedule definitions are reset to their canonical demo values. Only **future PENDING** occurrences belonging to the eight seeded Schedules are removed/reconciled; historical, `IN_PROGRESS` and completed execution records remain intact.

Demo login emails use the existing magic-link flow and are documented in `SEED-DEMO.md`. No demo passwords are created.

This is a staging/test convenience and should not be wired to run automatically on every production deployment.
---

## 43. v0.5.2 — Vercel/Supabase Demo Data Admin Utility

Because the project owner does not maintain a local Node/Prisma environment, the preferred staging
demo-data workflow is now a protected web utility hosted inside the deployed Vercel application.

New route:

`/admin/demo-data`

New API:

`POST /api/admin/demo-data`

The feature is available only when all applicable safeguards pass:

1. `DEMO_DATA_ENABLED=true`
2. Deployment identifies as the known staging host `edekhbhal-staging.vercel.app`
3. User is authenticated
4. User has an active `ADMIN` Organization membership
5. Browser request originates from `APP_URL` when Origin is present
6. User explicitly types the confirmation word `POPULATE`

The server-side utility uses Vercel's existing `DATABASE_URL` and writes directly to the Supabase
staging PostgreSQL database. No local environment or CLI is required.

The seed remains idempotent and canonical:

- 1 Demo Organization
- 6 Users
- 3 Properties
- 10 Work Areas
- QR records
- 15 Tasks
- 8 varied Schedules
- 48-hour rolling ScheduleOccurrence generation

On refresh, only future `PENDING` occurrences for seeded demo Schedules are reconciled. Historical,
`IN_PROGRESS`, and completed execution records are preserved.

The web populate/refresh operation is audit-trailed. To avoid a database migration solely for this
staging utility, the audit uses existing `ActionType.ORGANIZATION_UPDATED` with:

- `entityType = DemoDataSeed`
- `metadata.operation = DEMO_DATA_POPULATED`

A future schema release may introduce a dedicated demo-data audit action if desired.

Environment variable added:

`DEMO_DATA_ENABLED=false` by default.

This variable must never be automatically enabled in a future production project.

---

## 44. v0.6.0 — Mobile Execution Foundation

The existing Next.js application is formally referred to as the **Web version**. A separate installed **Mobile application** is being built primarily for `USER` role members, with one React Native/Expo codebase designed for both Android and Apple iOS.

The Web real-time Supervisor Dashboard is intentionally parked until the mobile execution workflow is completed and validated. The generated execution data will then feed the Supervisor Dashboard.

### Web change: Logout

A visible Logout action is added to the Web navigation and revokes the current Web Session before returning to Login.

### Organization-level claim expiry

`Organization.claimExpiryMinutes` is introduced, defaulting to 15 minutes and editable by ADMIN. It is deliberately configurable rather than hard-coded.

A claimed occurrence remains `PENDING` with `assignedUserId`, `claimedAt`, and `claimExpiresAt`. If the Work Area QR is not scanned before expiry, the claim is released to the queue. Once QR validation succeeds and execution becomes `IN_PROGRESS`, the claim no longer expires.

### Mobile queue and claim rules

- Mobile execution is currently restricted to active `USER` memberships.
- Viewing the next ScheduleOccurrence does not claim it.
- USER presses **Accept / Go to Work Area** to claim.
- Claim is atomic; a database partial unique index guarantees a USER cannot have two PENDING/IN_PROGRESS assigned occurrences simultaneously.
- The queue prioritizes the earliest generated unassigned PENDING occurrence.
- There is **no early-start restriction**. A USER may accept/start any upcoming occurrence already generated into the rolling horizon.
- Completed occurrences retain `assignedUserId` for historical performance reporting.

### QR start rule

Successful scan must validate:

1. QR record exists and is ACTIVE.
2. QR belongs to the expected Work Area.
3. Occurrence belongs to the USER and Organization.
4. Claim has not expired.
5. Occurrence is still startable.

Only successful QR validation writes the authoritative server `ScheduleOccurrence.startedAt` and Task 1 `actualStartAt` timestamps.

### Server-authoritative timers

The phone displays elapsed time calculated from server timestamps. The phone clock/timer is not the authoritative performance record.

When a Task completes:

- Task actual end/duration are saved.
- Next Task immediately becomes IN_PROGRESS and receives a new `actualStartAt`.
- Task timer therefore resets for the next Task.
- Overall Schedule timer continues from the original QR scan.

Final Task completion writes Schedule completion time and actual overall duration.

### Evidence

v0.6.0 evidence quantity is one photo or one video per required Task performance. Video maximum is 30 seconds in the mobile capture UI.

The mobile app provides **live camera capture only**. No gallery/image-picker dependency or workflow is included.

Random evidence remains resolved by occurrence generation. Mobile receives concrete `evidenceRequired` and `evidenceTypeRequired` fields and cannot decide the random sampling outcome.

Evidence bytes are uploaded directly to a private Supabase Storage bucket `execution-evidence` using short-lived signed upload URLs. The server verifies object existence, actual Storage size, content type and task/path ownership before inserting `ScheduleOccurrenceEvidence` metadata.

The Supabase server secret/service-role key stays only in Vercel server environment variables and must never be embedded in mobile binaries.

### Task and Schedule notes

New append-only `ScheduleOccurrenceNote` records support:

- `SCHEDULE` scope for overall execution observations.
- `TASK` scope for Task-specific observations.

Examples include delays, access issues, leaks, damaged equipment or other field observations. Notes include author/time and are audit-trailed. Notes are created during active execution; they are not an editable master-data field.

### New mobile audit actions

- `SCHEDULE_CLAIMED`
- `SCHEDULE_CLAIM_RELEASED`
- `SCHEDULE_CLAIM_EXPIRED`
- `SCHEDULE_EXECUTION_STARTED`
- `TASK_EXECUTION_STARTED`
- `TASK_EXECUTION_COMPLETED`
- `SCHEDULE_EXECUTION_COMPLETED`
- `TASK_NOTE_ADDED`
- `SCHEDULE_NOTE_ADDED`
- `EVIDENCE_CAPTURED`
- `MOBILE_SESSION_CREATED`

### Mobile authentication

Mobile reuses the eDekhbhal email identity model and opaque Session tokens. Tokens are kept in encrypted device SecureStore. Staging supports a Development Sign In flow because outbound email/mobile deep-link delivery is not yet connected. Production email OTP/deep-link delivery remains a pre-public-release task.

### Mobile application technology

The `/mobile` project uses React Native with Expo/Expo Router and is designed for Android and iOS. It includes:

- camera QR scanning;
- camera photo/video evidence;
- encrypted session storage;
- task/schedule timers;
- rich HTML Task instructions;
- notes;
- My Work queue;
- personal performance report;
- profile/logout.

Mobile navigation is:

`My Work | Scan | Report | Profile`

### New server environment variables

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only secret)
- `EVIDENCE_BUCKET=execution-evidence`
- optional `MOBILE_DEV_AUTH_ENABLED`

### v0.6.0 database migration

`supabase-v0.6.0.sql` adds claim fields, actual duration seconds, Organization claim expiry, occurrence notes, mobile audit enums, concurrency indexes and the private evidence Storage bucket.

### Current next steps after v0.6.0 deploy

1. Run the Supabase v0.6.0 SQL migration.
2. Add the server-only Supabase Storage variables to Vercel.
3. Deploy Web/API v0.6.0 and validate the Vercel build.
4. Produce an internal Android preview build with Expo EAS and test on a physical device.
5. Configure iOS signing/internal distribution/TestFlight and test on a physical iPhone.
6. Complete mobile workflow hardening based on field tests.
7. Return to the Web version and build the real-time Supervisor Dashboard over ScheduleOccurrence execution data.

---

# End of Canonical Context

When this document conflicts with older chat text, the latest dated/build-specific section in this file is the working context unless the product owner explicitly changes it.
---

## v0.6.0 Build Hotfix — Canonical Prisma Schema & Root Duplicate Files

The first v0.6.0 Vercel build reached Next.js compilation successfully but failed during TypeScript validation.

Diagnosis from the deployed GitHub tree:

- The repository contains the correct application under `src/` and the correct Prisma schema at `prisma/schema.prisma`.
- It also contains older flattened duplicate files at the repository root, including files such as `page (6).tsx`, `route (xx).ts`, component copies, and a stale root `schema.prisma`.
- The default TypeScript glob `**/*.ts` / `**/*.tsx` caused Next.js type checking to include those stale root duplicates.
- Prisma also selected the stale root `schema.prisma` instead of the canonical `prisma/schema.prisma`, so the generated Prisma Client did not contain newer v0.6.0 fields such as `Organization.claimExpiryMinutes`.

The hotfix therefore makes two defensive changes:

1. `package.json` explicitly uses `prisma/schema.prisma` for Prisma generate/push commands.
2. `tsconfig.json` type-checks only `src/**/*.ts`, `src/**/*.tsx`, Next generated types, and `next-env.d.ts`; the separate `mobile/` project remains excluded from the Web build.

No Supabase migration or Vercel environment-variable change is required for this hotfix.

Longer-term repository hygiene: the obsolete flattened root duplicates should be deleted from GitHub, but the build no longer depends on that cleanup.
---

## v0.6.0 Build Hotfix 2 — Supabase Evidence Object Size Type

After the canonical Prisma-schema / TypeScript-scope hotfix, Vercel correctly loaded
`prisma/schema.prisma` and compiled the Next.js application. Type checking then exposed
a stricter issue in the evidence-confirmation endpoint: Supabase Storage metadata types
allow an object's `size` to be undefined.

The fix makes `getEvidenceObjectInfo()` validate the Storage metadata and return a strict
numeric `size`. The evidence confirmation route also keeps a defensive runtime validation
before enforcing photo/video size limits.

No database migration or Vercel environment-variable change is required for this hotfix.
---

## v0.6.0 Web Hotfix — Logout Visibility

The Web logout functionality and `/api/auth/logout` endpoint were already present and correct,
but the header Logout button did not explicitly define a text color. Browser default button
styling could therefore make the control effectively invisible on the dark navigation bar.

The Web navigation CSS now:
- explicitly renders Logout in white,
- gives it a subtle border/background so it is discoverable,
- prevents the account/logout area from shrinking away at the right edge.

No database migration or Vercel environment-variable change is required.



---

## v0.6.0 Mobile Build Compatibility and First Successful Android APK

The Expo SDK 57 mobile build required dependency alignment before Android EAS could compile successfully.

Final aligned mobile versions:

- React `19.2.3`
- react-dom `19.2.3`
- React Native `0.86.3`
- react-native-reanimated `4.5.1`
- react-native-worklets `0.10.1`

Additional compatibility changes:

- Removed obsolete `newArchEnabled` from `mobile/app.json` because Expo SDK 57 uses the New Architecture by default.
- Removed deprecated TypeScript `baseUrl` while preserving the `@/*` alias.
- `npx expo-doctor` passes 21/21 checks.
- `npm run typecheck` passes.
- `npm ci` succeeds.

First successful Android preview APK build:

- Build ID: `c65932fb-df7d-44d2-85ae-d06b84c5d450`
- Profile: `preview`
- Distribution: `internal`
- SDK: `57.0.0`
- App version: `0.6.0`
- Version code: `1`
- Source commit used by EAS: `204aeb0138b39131837a12599b89e49346f0506e`
- Status: finished

The mobile application has been field-tested successfully through the execution workflow. Execution data is persisted against concrete Schedule Occurrences and Occurrence Tasks, preserving the Schedule/Work Area/Property snapshots and server-authoritative execution timestamps needed for reporting.

---

## Agreed QR Enhancements for the Next Web Increment

The standalone Work Areas page should expose the same QR management controls that already exist under Property detail:

- active QR visibility,
- View/Reprint QR,
- Regenerate QR,
- Print QR,
- Admin/Property Manager authorization,
- existing QR audit behavior.

The same physical Work Area QR will remain dual-purpose:

1. eDekhbhal mobile app scan -> authenticated Work Area validation and execution start.
2. Ordinary phone-camera scan -> public Web transparency page.

The public transparency page should show the latest completed Schedule/service for the Work Area, including:

- Schedule/Task List name,
- service date and actual start/end,
- serviced-by user's display name,
- planned total duration vs actual total duration,
- all completed Tasks,
- each Task's planned duration vs actual duration and deviation.

Internal notes, audit details, worker contact information and evidence media remain private unless explicitly changed later. Public QR transparency should be Organization-configurable so tenants can disable it when required.

---

## v0.6.1 Reports Foundation — Service Log

The first Web report is **Reports -> Service Log**.

Access is restricted to active `ADMIN` and `PROPERTY_MANAGER` memberships.

The Service Log is Task-performance based: one row represents one completed `ScheduleOccurrenceTask`. It is tenant-scoped through the parent `ScheduleOccurrence.organizationId`.

Current columns:

1. Property
2. Work Area
3. Task List
4. Sr. No.
5. Task Performed
6. Actual Time Taken
7. Scheduled Time
8. Deviation
9. User
10. Date
11. Start Time
12. End Time

Field mapping:

- Property -> `ScheduleOccurrence.propertyNameSnapshot`
- Work Area -> `ScheduleOccurrence.workAreaNameSnapshot`
- Task List -> `ScheduleOccurrence.scheduleNameSnapshot` (the current data model uses Schedule as the executable Task List)
- Sr. No. -> `ScheduleOccurrenceTask.sequence`
- Task Performed -> `ScheduleOccurrenceTask.taskNameSnapshot`
- Actual Time Taken -> `ScheduleOccurrenceTask.actualDurationSeconds`, with a defensive fallback calculated from actual start/end timestamps
- Scheduled Time -> `ScheduleOccurrenceTask.plannedDurationMinutes`
- Deviation -> actual duration minus planned duration
- User -> `ScheduleOccurrence.assignedUser`, display name with email fallback
- Date / Start Time / End Time -> Task actual start/end timestamps displayed in the occurrence timezone

The report intentionally uses snapshot fields so later edits to Schedule, Property, Work Area or Task definitions do not rewrite historical report output.

Current filters:

- From Date
- To Date
- Property
- Work Area
- Task List / Schedule
- User

Date filtering uses the Organization timezone for inclusive calendar-day boundaries. Displayed Task date/start/end values continue to use each occurrence timezone.

All displayed Service Log columns are sortable by clicking the column heading. Sorting supports ascending/descending order and handles text, task sequence, actual duration, scheduled duration, deviation, user, date, start time and end time using the underlying typed values rather than formatted display text. Default sort is service date/time descending.

Initial result limit: latest 500 matching completed Task performances. Column sorting applies to the matching rows loaded into the report.

No database migration is required for the Service Log; all required reporting data is already stored by the v0.6.0 occurrence/execution model.

Recommended next report enhancements:

- CSV/XLSX export,
- occurrence-level drill-down,
- evidence/notes drill-down for authorized management users,
- schedule completion summary,
- user performance analytics,
- Property/Work Area service-compliance analytics,
- real-time Supervisor Dashboard.


---

## v0.7.0 — Supervisor Dashboard & Web UX Modernization

The Web Dashboard is now an Admin/Property Manager operational command center. USER-role members remain focused on mobile execution and are redirected away from the management Dashboard.

Dashboard capabilities:

- live USER-role workforce table with Online / Working / Offline state;
- last mobile login time from existing LOGIN audit events;
- foreground-active duration from mobile heartbeat telemetry;
- current Property, Work Area, Schedule and Task derived from the assigned IN_PROGRESS ScheduleOccurrence;
- time in Work Area derived from server-authoritative occurrence start time;
- auto-updating Task completion Activity Feed with actual duration, planned duration and deviation;
- latest 20 evidence photos/videos in a private signed-URL carousel with user/work-area/task context;
- Attention Required panel for overdue, missed and partially completed occurrences;
- Today's Schedule Progress summary;
- KPI cards for users online, schedules in progress, tasks completed today, exceptions and average duration deviation.

Dashboard polling cadence is approximately 12 seconds. This is intentionally simple and resilient for the first Supervisor Dashboard release; realtime subscriptions/websockets can be added later if scale requires them.

### USER mobile presence

New additive table: `user_presence`.

The mobile app sends a best-effort heartbeat every 45 seconds while foregrounded. A worker is considered online when a current heartbeat is present within approximately two minutes. Heartbeat telemetry is not written to AuditLog because doing so would create high-volume noise. Significant actions (login, logout, claim, execution start/completion, evidence, notes) remain audited.

Presence failures never interrupt mobile execution or logout. The Dashboard degrades gracefully if the presence migration has not yet been applied.

Migration file: `supabase-v0.7.0-dashboard.sql`.

### Web navigation / visual modernization

The existing URLs, APIs and business workflows are preserved. The Web shell is reorganized into a modern role-aware navigation:

- Dashboard (Admin / Property Manager)
- Operations: Properties, Work Areas, Tasks, Schedules
- Reports (Admin / Property Manager)
- Administration: Audit Trail, plus Team / Organization / Subscription / Demo Data where Admin permissions apply
- Profile / Logout

A new additive `modern.css` theme is loaded after the legacy stylesheet so existing components retain their functional class names while receiving consistent typography, spacing, cards, navigation, tables, forms and responsive behavior.

### Security / privacy

- Dashboard API is server-role-gated to active ADMIN / PROPERTY_MANAGER memberships.
- Every Dashboard query is Organization-scoped.
- Evidence remains in the private Supabase Storage bucket; the Dashboard only receives short-lived signed download URLs.
- Internal notes and audit details are not exposed in the evidence carousel.

### Validation required before merge/deployment

Run Web typecheck and production build, Mobile typecheck and Expo Doctor, then execute the functional regression checklist in `DASHBOARD-v0.7.0-TESTING.md`.


---

## v0.8.0 — Mobile UX, Localization & Personal Reporting

This increment extends the USER mobile application while preserving the v0.6/v0.7 execution engine, camera-only evidence rules, server-authoritative timers, tenant isolation and Supervisor Dashboard heartbeat architecture.

### Authentication / Profile

- Mobile USER can sign in with **Email + Password** after setting a password.
- Existing email/magic-link sign-in remains available as the initial access and password-recovery path.
- There is no separate username login identity; `User.name` is the editable Display Name and email remains the authentication identity.
- Passwords are never stored in plaintext. `User.passwordHash` stores a one-way scrypt hash.
- `Session.authMethod` records PASSWORD or MAGIC_LINK for secure recovery behavior.
- A magic-link-authenticated session may reset an existing password without knowing the old password; normal password sessions require the current password to change it.
- Password changes revoke other mobile sessions while preserving the current session.
- Mobile Profile supports Display Name, preferred language, password management, Organization/Role/Timezone read-only context and a prominent confirmed Sign Out action.

### Preferred Language / Localization

Supported initial languages:

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

`User.preferredLanguage = null` means English/default.

Mobile application chrome/navigation/execution/profile/report labels use bundled dictionaries and fall back to English if a label is unavailable. Organization, Property and Work Area names remain business identifiers and are not silently translated.

Admin-authored Schedule/Task content remains English as the authoritative source. For a non-English preference, occurrence Schedule names, Task names and Task instructions are translated server-side and cached in `ContentTranslation`. Cached translations are keyed by Organization/source/field/language plus a source hash, so editing source content naturally invalidates the old cached version.

Translation provider order:

1. `GOOGLE_TRANSLATE_API_KEY` if configured; otherwise
2. a compatible `TRANSLATION_API_URL` with optional `TRANSLATION_API_KEY`.

If no translation provider is configured or a provider fails, execution remains available and the authoritative English content is shown. Translation failure must never block field execution.

### Text to Speech

- Mobile uses Expo Speech / device text-to-speech.
- A speaker button reads the current Task name and detailed instructions.
- When translated content is available, speech uses the selected language locale; otherwise the English source is read.
- Long instructions are chunked to stay within native speech input limits.

### Notes keyboard fix

Task Notes and Schedule Notes use a top-positioned, keyboard-aware modal. Android uses resize keyboard layout mode. The note text and Save/Cancel actions must remain visible while typing.

### Personal Reports

The existing Report tab becomes a searchable personal work-history screen.

Filters:

- Today
- Last 7 days
- Last 30 days
- Custom From/To dates
- Search by Task, Schedule, Property or Work Area

The API is always tenant-scoped and user-scoped. Results expose only that USER's own performance. Each result shows status, planned duration, actual duration, deviation, Task details, evidence count and the USER's recorded Task/Schedule notes. Pagination prevents large histories from being downloaded at once.

### Dashboard heartbeat

The v0.7.0 foreground heartbeat source code is retained. The new v0.8.0 APK is the first planned replacement APK containing both heartbeat and these mobile UX improvements. Once installed and foregrounded, Dashboard Users Online should reflect current workers rather than showing `Working · no heartbeat` for the old APK.

### Database additions

- `User.passwordHash`
- `User.preferredLanguage`
- `Session.authMethod`
- `ContentTranslation`

Migration file: `supabase-v0.8.0-mobile-profile-i18n.sql`.

### Validation gate

Before staging deployment / APK build:

1. Web TypeScript check.
2. Web production build.
3. Mobile clean install.
4. Mobile TypeScript check.
5. Expo Doctor 21/21 expected.
6. Apply the additive Supabase v0.8.0 migration only after compile checks pass.
7. Configure a translation provider secret in Vercel without committing any key.
8. Regression-test claim → QR → timers → evidence → notes → completion → Dashboard → Reports.


---

## v0.8.1 — Mobile Navigation Visibility Hotfix

Field testing of the v0.8.0 Android APK on a Samsung device showed that the bottom navigation tab content was rendered too close to / into the Android system navigation area. My Work remained usable, but Scan, Report and Profile labels/icons were effectively invisible, which also made Profile-only features such as preferred language, password management and Sign Out appear missing.

The v0.8.1 mobile-only hotfix:

- uses `react-native-safe-area-context` bottom insets for the tab bar;
- raises the tab content above Android system navigation;
- explicitly sets active and inactive tab colors;
- explicitly applies the navigator-provided tint color to custom tab icons;
- increases label contrast and weight;
- adds a subtle active-tab background;
- preserves the existing four tabs: My Work, Scan, Report and Profile;
- bumps Android `versionCode` to 3 so the corrected APK installs as an update.

No database migration or Web/API change is required for this hotfix.


---

## v0.9.0 — Smart Service Compliance & Public Work Area QR

This release consolidates the next Web/API operational roadmap around service compliance.

### Smart recurring-schedule supersession

Recurring operational schedules use a **latest due occurrence wins** rule when `Schedule.supersedeUnstarted = true` (default).

- Future pre-generated occurrences do not supersede anything until their own `scheduledStartAt`.
- When a later occurrence of the same recurring Schedule becomes due, older unstarted `PENDING` occurrences are automatically changed to `MISSED`.
- A claimed-but-unstarted occurrence is still `PENDING`; it is released and marked `MISSED` when superseded.
- `IN_PROGRESS`, `COMPLETED`, `PARTIALLY_COMPLETED`, `MISSED` and `CANCELED` history is never rewritten.
- PENDING occurrence Tasks are marked `MISSED` at the same time.
- The reason is stored in `ScheduleOccurrence.missedReason`.
- `autoMissedAt` records when the rule was applied.
- Audit action: `SCHEDULE_OCCURRENCE_AUTO_MISSED`.
- Reconciliation runs in the occurrence cron and immediately before the mobile next-work queue is resolved.

This prevents repetitive operational work from accumulating as a catch-up backlog while preserving accountability in management reporting.

### Public Work Area QR status

The existing printed Work Area QR remains the single QR identity.

A normal phone camera can scan it without installing or opening the eDekhbhal mobile application. The public `/qr/[token]` page shows only safe operational status:

- Work Area and Property;
- last completed/partially completed service;
- last service date/time and duration;
- relative last-serviced age;
- next scheduled service;
- recent completed/partial/missed service history.

The public page deliberately does **not** expose worker identity, email addresses, internal notes, evidence, audit information or tenant administration data.

The authenticated eDekhbhal mobile app continues to use the same QR identity for execution validation. Regenerating/revoking a QR makes the previous public QR invalid because the public route requires an ACTIVE `QrCode` record.

### Work Area Web service status

Admin/Property Manager Work Areas now provide a Service Status page with:

- current active public QR link;
- last service;
- next scheduled service;
- recent history;
- direct management occurrence drill-down.

### Service Compliance & Analytics

New `/reports/compliance` reporting provides:

- Completed / Partially Completed / Missed KPIs;
- service-compliance percentage;
- filters by date, Property, Work Area, Schedule, User and final status;
- summaries by Schedule;
- summaries by Property;
- summaries by Work Area;
- summaries by User;
- occurrence-level drill-down.

### Occurrence management drill-down

`/reports/occurrences/[id]` is restricted to active ADMIN / PROPERTY_MANAGER memberships and is organization-scoped. It shows:

- occurrence snapshot/context;
- schedule and Task timing/status;
- actual durations;
- auto-miss reason;
- Schedule and Task notes;
- authorized evidence previews through short-lived signed URLs.

### Service Log exports

The existing Service Log retains its filters and gains:

- CSV export;
- XLSX export;
- export limit up to 5,000 matching completed Task performances.

The XLSX endpoint uses the server-side `xlsx` package. Export endpoints are session-authenticated, management-role-gated and Organization-scoped.

### Database additions

- `Schedule.supersedeUnstarted Boolean @default(true)`
- `ScheduleOccurrence.autoMissedAt DateTime?`
- `ScheduleOccurrence.missedReason String?`
- `ActionType.SCHEDULE_OCCURRENCE_AUTO_MISSED`
- supporting occurrence index

Migration: `supabase-v0.9.0-smart-compliance.sql`.

### Mobile binary impact

No new Android binary is required for v0.9.0. The installed v0.8.1 app receives the smarter queue behavior through the server API. Public QR status is browser-based and works from a normal phone camera.

### v0.9.0 staging gate

1. Apply package.
2. Install root dependencies without forcing audit upgrades.
3. Generate Prisma client.
4. Web typecheck.
5. Web production build.
6. Mobile typecheck.
7. Expo Doctor.
8. Apply `supabase-v0.9.0-smart-compliance.sql` in staging.
9. Redeploy/verify Vercel.
10. Functional regression using `TESTING-v0.9.0.md`.


---

## v0.9.1 — Direct Work Area QR Visibility Hotfix

Field validation of v0.9.0 confirmed Reports → Service Compliance, Work Areas → Service Status and the public QR status page were working correctly.

A Web UX gap remained: when entering **Work Areas** directly, QR display/printing was still available only through the Property detail Work Area manager.

v0.9.1 closes that gap without changing the QR data model or security behavior.

### Direct Work Areas QR controls

The standalone Work Areas table now provides the same active-QR management flow already available under Property detail:

- **View / Reprint QR**
- **Regenerate QR**
- QR modal with the actual QR image
- QR ID
- Parent Property
- **Print QR**

Regenerate continues to use the existing audited QR regeneration endpoint and invalidates the prior QR exactly as before.

### Work Area Service Status QR visibility

The management Service Status page now renders the actual active Work Area QR image, not only a link to the public status page.

The displayed QR remains the same QR identity used for:

1. authenticated eDekhbhal mobile execution validation; and
2. normal phone-camera access to the public Work Area service-status page.

### Database / mobile impact

- No database migration.
- No mobile binary change.
- Existing v0.8.1 Android APK remains valid.


---

## Fine-tuning Batch 01 — Audit, Personnel & Property Access Foundation

This batch is intentionally **not** a semantic version bump. The application remains v0.9.1 until the broader access-control work, including the RLS security gate, is validated and ready to become the next meaningful release.

### Audit Trail
- Date/User/Action/Entity filters, global search, pagination and sorting.
- CSV/XLSX export respects active filters/search.

### Personnel Profiles
- Name, address, phones, Role, Status and internal Notes.
- Private profile picture upload with browser camera capture when available.
- Multiple verification documents with type, description, optional expiry and signed private access.
- User self-service never exposes internal Notes.
- Property Managers may maintain User personnel details only within their assigned scope.
- Role, Status and Property assignment remain Admin controls.

### Property Assignments
- Many-to-many OrganizationMember ↔ Property assignment.
- Admin can assign multiple Properties from Team profile or Property → Team Assignments.
- Admin has Organization-wide access.
- Property Manager and User access is assignment-based.
- User with no assigned Property gets no available mobile work.
- Property master-data create/edit is Admin-only; Property Manager sees assigned Property master data read-only.

### RLS security gate
RLS is deliberately not enabled in this batch. First validate application-level Admin / Property Manager / User property scoping in staging. Then complete remaining endpoint scoping and introduce RLS in staging with an appropriate non-bypass runtime role / request context before the next release is production-ready.



### Fine-tuning Batch 01A — Property Manager Self-Service Profile Hotfix
- Fixes a 404 when a Property Manager opens My Profile → View Full Self-Service Profile.
- Property Manager self-access is allowed.
- Property Manager access to other personnel remains limited to USER records within assigned Property scope.
- Internal management Notes remain hidden on self-service access.



### Fine-tuning Batch 02 — Automated Functional Testing Foundation
- Playwright is the Web/API E2E framework.
- Tests target staging, never production.
- Staging-only E2E auth requires E2E_TESTING_ENABLED=true, non-production Vercel environment, E2E_TEST_SECRET, and explicit allowed E2E emails.
- E2E setup creates/reuses deterministic Property A/B plus PM, assigned User and unassigned User fixtures in the Organization belonging to E2E_ADMIN_EMAIL.
- Initial automated coverage: key-screen smoke, Audit export smoke, PM self-profile regression, property visibility/API authorization and unassigned mobile queue.
- GitHub Actions workflow is manual initially; automatic post-deploy execution can be enabled after stability is proven.
- Native Android camera/QR/evidence UI remains manual for now; mobile backend/API behavior is automatable.



### Fine-tuning Batch 02A — E2E Runtime Hotfix
- Dedicated staging Vercel projects can report VERCEL_ENV=production for their production branch even though the application itself is staging.
- E2E enablement now binds to APP_URL=https://edekhbhal-staging.vercel.app plus E2E_TESTING_ENABLED=true instead of rejecting VERCEL_ENV=production.
- Secret and explicit-email allow-list checks remain mandatory.
- Codespaces Playwright install command now includes Linux system dependencies via `playwright install --with-deps chromium`.



### Fine-tuning Batch 02B — Mobile E2E Authentication Fix
- The first mostly-green live Playwright run passed 8/9 tests.
- The remaining mobile queue test was a test-harness mismatch, not an application authorization failure: mobile APIs require `Authorization: Bearer <session-token>`, while the Web E2E login helper only established the `edk_session` cookie.
- The staging-only E2E session helper now also returns its generated short-lived session token to an authenticated E2E caller.
- Mobile API E2E tests use that token as a Bearer token and assert the unassigned USER receives exactly `state: "EMPTY"` and `occurrence: null`.



### Fine-tuning Batch 02C — GitHub Actions E2E Baseline
- Live staging Playwright baseline is green: 9/9 tests passed.
- Covered baseline scenarios: Audit Trail access/export, unassigned USER mobile queue returns no executable work, Admin sees both E2E Properties, PM sees only assigned Property A, PM cannot update Property master through API, PM cannot access unassigned Property B detail, USER cannot open another Team Member profile, Admin key-screen smoke coverage, and PM full self-service profile access.
- Added manual GitHub Actions workflow `.github/workflows/e2e-staging.yml`.
- Workflow uses Node 20, `npm ci`, Chromium with Linux dependencies, repository Actions secrets for E2E credentials, and uploads the Playwright report artifact.
- Keep GitHub Actions workflow manual (`workflow_dispatch`) until the expanded authorization suite is stable; automatic post-deploy execution is a later step.
- RLS remains deferred until broader server-side authorization/API regression coverage is implemented and green.



## Fine-tuning Batch 03 — Cumulative Operations / Properties / Reported Work
- Dashboard: standalone Users Online KPI removed; `X online / Y users` moved to `Who is active now`.
- Dashboard KPIs consolidated into one operational summary panel.
- Recent Evidence moved to the top, one photo/video at a time, rotating every 30 seconds, with maximize/minimize overlay and expanded horizontal thumbnail strip.
- Lower Evidence carousel removed. Live Workforce desktop density tightened; responsive scrolling retained when needed.
- Dashboard data is Property-scoped for Property Managers.
- Properties: `Property Details | Work Areas | Team Assignments` retained; Team Assignments now role-separated into Property Managers and Users with compact Admin assignment checklists and contact context; PM remains read-only.
- New mobile Task/Schedule notes create explicit `ReportedWorkItem` records and surface in Dashboard Attention Required.
- Admin can action all reports; PM only assigned Properties; User cannot action them.
- Create Schedule from a report is prefilled to Work Area and defaults One Time; recurring remains selectable. Resulting Schedule is explicitly linked.
- Dismissal is historical, not deletion; dismissed items remain in Reports and can later create a Schedule while preserving dismissal history.
- Reports adds `Reported Notes / Work Requests` with reporter/time/Property/Work Area/context/note/status/history/resulting Schedule.
- Audit adds Entity Type/Entity ID dropdown filtering, rows/page 25/50/75/100 (default 50), range/page footer, and prospective request IP/user-agent/request-id capture.
- Personnel document display adds image thumbnails and PDF/file placeholders linked to signed files.
- Automated regression rule: Requirement → implementation → automated test coverage → regression suite update → PROJECT-CONTEXT update.
- Batch 03 adds automated Reported Work tests. RLS remains deferred and is NOT enabled in this batch.



### Batch 03A — E2E locator / Node 24 workflow hotfix
- First 22-test Batch 03 staging run: 18 passed, 4 failed only because Playwright strict locators matched both form options/labels and the intended table/heading elements.
- No application behavior failure was identified in those four failures.
- E2E locators were narrowed with exact labels/headings and report-row scoping.
- GitHub Actions E2E runtime updated to Node 24 and official Node-24-compatible actions (`checkout@v6`, `setup-node@v6`, `upload-artifact@v6`), removing the Node 20/Supabase engine mismatch.
- Re-run the complete 22-test staging suite after deployment.

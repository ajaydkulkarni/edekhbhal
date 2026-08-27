# eDekhbhal — Project Context, Functional Brief & Continuity Notes

> **Purpose of this file**
>
> This is the canonical continuity document for the eDekhbhal project. It summarizes the product vision, functional requirements, architecture decisions, permissions, current implementation, environment/deployment notes, version history, known limitations, and the agreed roadmap.
>
> **Use this file whenever development resumes in a new ChatGPT conversation, on another computer, or after a long gap.**
>
> Going forward, this file should be updated with every build/release and kept in the root of the GitHub repository as `PROJECT-CONTEXT.md`.

**Last updated:** 2026-08-27
**Current application version:** v0.5.1  
**Current deployment status:** Successfully built and deployed on Vercel after v0.5.1 syntax hotfix  
**Current GitHub deployment commit observed in successful Vercel build:** `e6343e1`

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

# End of Canonical Context

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


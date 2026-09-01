# Demo Workspace Architecture

**Decision date:** 2026-08-31  
**Status:** Canonical product architecture companion to `PROJECT-CONTEXT.md`

## Terminology

- **Organization Workspace** — the customer's real, persistent operational workspace backed by tenant-scoped database records.
- **Demo Workspace** — one universal, shared, read-only best-practice workspace available to every customer Organization.

Current display name:

`eDekhbhal Best Practice Demo`

The display name is temporary branding. Business logic must use neutral identifiers such as:

- `workspaceMode = DEMO`
- `best-practice-demo`

so a future product rename does not require a Demo data-model redesign.

## Standing Demo parity rule — mandatory

Going forward, every functional addition or change to the Organization Workspace must be evaluated and implemented in the Demo Workspace as well, without requiring the product owner to repeat this requirement.

Examples:

- new navigation/page -> corresponding Demo experience;
- new Task/Schedule capability -> representative Demo example;
- new Dashboard KPI -> synthetic Demo KPI;
- new Report/filter/metric -> synthetic Demo equivalent;
- new Property/Work Area feature -> appropriate industry example;
- new role/permission behavior -> reflected in the Demo role simulator;
- new QR/public-web capability -> fake Demo QR equivalent when applicable;
- UI/UX improvements -> applied appropriately to both workspace modes.

Intentional exceptions are actions that should not operate against synthetic/sample data, including real mobile execution, billing, authentication, destructive operations, real evidence capture, and other persistent operational writes. In those cases, implement an educational/read-only equivalent rather than silently omitting the feature.

This parity rule is a standing architectural requirement.

## Workspace switching

Authenticated users can switch from a header Workspace dropdown between:

1. their real Organization Workspace; and
2. the universal Demo Workspace.

Demo uses a visually distinct background/theme and persistent banner:

`DEMO WORKSPACE — Sample data`

The Demo is not represented as an `Organization` row and users are not granted Demo Organization memberships.

## Universal Demo structure

Reference Organization display name:

`eDekhbhal Best Practice Demo`

Properties:

1. **Grand Vista Hotel** — Hospitality
2. **FreshBite Foods Manufacturing Plant** — Food Manufacturing
3. **Industrial Maintenance Facility** — Maintenance
4. **Corporate Headquarters** — Corporate Office

The Food Manufacturing example contains two lot-production Schedule examples:

- **Butter Chicken Bowl — Lot Production**
- **Delight Cookies — Lot Production**

Maintenance contains both:

- Preventive Maintenance examples
- Breakdown Maintenance examples

## Persistence model

Demo master definitions are static application data, not cloned per customer.

Synthetic activity is generated dynamically/deterministically relative to current date/time.

Do not continuously insert fake:

- ScheduleOccurrence rows;
- ScheduleOccurrenceTask rows;
- evidence rows;
- AuditLog rows;
- Report rows;
- presence/heartbeat rows.

This prevents database growth proportional to the number of tenants or passage of time.

## Synthetic activity rules

Demo operational data must look realistic rather than perfect.

Include deterministic examples of:

- completed on time;
- completed late;
- delayed start;
- in progress;
- upcoming;
- missed;
- incomplete/partial work;
- missing/required follow-up;
- production QC hold;
- breakdown maintenance exception;
- planned vs actual duration variance.

Use a stable date/scenario seed so Dashboard, Reports, Schedule examples and QR status stay internally consistent instead of changing randomly on every page refresh.

## Reports

Demo Reports are functional synthetic reports, not screenshots/placeholders.

They should evolve in parity with real reporting and include realistic exceptions, trends and filters as the real Reports module grows.

## Role simulator

Everyone can browse the full Demo Workspace.

Provide:

`View as Admin | Property Manager | User`

The simulator is educational only and must never change the user's real account permissions.

Future Demo screens should use the selected simulated role to explain/show the corresponding role perspective while still allowing full Demo exploration.

## Task templates

Demo Workspace is read-only, with one permitted bridge into real tenant data:

`Use this Task as a template`

The preferred flow is a prefilled normal Add Task screen in the real Organization Workspace. Nothing is written until an authorized Admin/Property Manager reviews and saves the Task.

Do not copy Schedules from Demo into real Organizations.

## Demo QR

Demo Work Areas have fake/public web QR experiences.

They display:

- Property;
- Work Area;
- prominent Demo/Sample indicator;
- synthetic recent service/history;
- realistic exceptions.

Demo QR does not support mobile task execution.

## Security / RLS

Demo data source is separate from normal tenant persistence and does not create a shared Demo tenant membership model.

This is intentional so Demo functionality does not weaken tenant isolation or complicate RLS policy design.

The real Organization Workspace remains fully tenant-scoped and subject to normal authorization/RLS work.

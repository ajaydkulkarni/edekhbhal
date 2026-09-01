# eDekhbhal Demo Workspace Batch 02 — UI & Drill-down Parity

Branch: `v2-rebuild`

This batch changes Demo Workspace from summary/brochure-style pages into a read-only product demonstration that closely follows the real Organization Workspace structure.

## Upload / replace these files

### Replacements
1. `src/lib/demoWorkspace.ts`
2. `src/components/DemoRoleSimulator.tsx`
3. `src/components/WorkspaceSwitcher.tsx`
4. `src/components/DemoWorkspaceNav.tsx`
5. `src/app/demo/layout.tsx`
6. `src/app/demo/dashboard/page.tsx`
7. `src/app/demo/[section]/page.tsx`
8. `src/app/demo/demo-workspace.css`
9. `e2e/demo-workspace.spec.ts`

### New files
10. `src/lib/demoRole.ts`
11. `src/app/demo/properties/[id]/page.tsx`
12. `src/app/demo/work-areas/[id]/page.tsx`
13. `src/app/demo/tasks/[id]/page.tsx`
14. `src/app/demo/schedules/[id]/page.tsx`

## Important behavior

- Demo remains a separate synthetic/read-only data source.
- No Demo master/activity rows are written to PostgreSQL.
- Demo Property, Work Area, Task and Schedule lists now look structurally like the real workspace.
- Property, Work Area, Task and Schedule rows are clickable.
- Schedule detail shows ordered Tasks, planned durations/times, evidence rules, Demo QR and synthetic occurrences.
- Task detail shows definition/instructions, sample attachment count, usage and safe "Use this Task as a template".
- Role simulator now uses a harmless Demo-only cookie and server refresh so the displayed scope actually changes.
- Authenticated users without a real Organization membership can enter Demo; switching to REAL sends them to onboarding.
- RLS remains disabled.

## Test expectation

The focused Demo suite increases from 5 tests to 8 tests.

After upload and V2 deployment:

```bash
npm run db:generate
npm run typecheck
npm run build
```

Then run **E2E V2** GitHub Actions against `v2-rebuild`.

Expected focused Demo suite: `8 passed`.

The previous full suite was 41 tests. Replacing 5 Demo tests with 8 Demo tests should make the expected full-suite count **44 passed**, assuming no other E2E files changed.

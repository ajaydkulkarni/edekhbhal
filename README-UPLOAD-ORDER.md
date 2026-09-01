# Demo Workspace Batch 01 — Upload and Validation

## Important sequencing

If `Tenant Context Migration 01A — Task Create` has not yet been uploaded/tested, upload that earlier batch first because the Demo Task template eventually saves through the normal Task creation API.

Demo Workspace Batch 01 itself does **not** enable RLS and does not add database migrations.

## Replace existing files

1. `src/components/Nav.tsx`
2. `src/app/tasks/new/page.tsx`

## Add new files

3. `src/lib/demoWorkspace.ts`
4. `src/components/WorkspaceSwitcher.tsx`
5. `src/components/DemoRoleSimulator.tsx`
6. `src/components/DemoWorkspaceNav.tsx`
7. `src/app/demo/layout.tsx`
8. `src/app/demo/page.tsx`
9. `src/app/demo/dashboard/page.tsx`
10. `src/app/demo/[section]/page.tsx`
11. `src/app/demo/demo-workspace.css`
12. `src/app/demo-qr/[id]/page.tsx`
13. `e2e/demo-workspace.spec.ts`
14. `DEMO-WORKSPACE-ARCHITECTURE.md`

## What Batch 01 delivers

- Header workspace selector.
- Distinct Demo theme and persistent `DEMO WORKSPACE — Sample data` banner.
- One universal static best-practice dataset; no Demo tenant DB rows.
- Hospitality, Food Manufacturing, Maintenance and Corporate Office examples.
- Butter Chicken Bowl and Delight Cookies lot-production examples.
- Preventive and breakdown maintenance examples.
- Deterministic synthetic Dashboard activity including late/missed/incomplete exceptions.
- Synthetic 30-day Demo Reports.
- Demo role simulator.
- Public fake Demo QR pages with synthetic recent exception history.
- `Use this Task as a template` opens the real Add Task screen prefilled.
- No Schedule copy.
- No Demo mobile execution.
- Standing Demo parity architecture documented.

## Deploy / test

After uploading all files, deploy `v2-rebuild`, then:

```bash
git pull origin v2-rebuild
npx playwright test e2e/demo-workspace.spec.ts
```

Expected:

```text
5 passed
```

Then run the complete suite:

```bash
npm run test:e2e
```

Expected total depends on whether Tenant Context Migration 01A was already added:

- If the prior 3 Task-context tests are present: **44 passed**
- If not: **41 passed**

Do not enable RLS as part of this batch.

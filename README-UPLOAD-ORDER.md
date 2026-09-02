# eDekhbhal Demo Workspace Batch 03
## Dashboard & Navigation Parity

Target branch: `v2-rebuild`

This batch addresses the verified visual/behavior gaps between the real Organization Dashboard and the Best Practice Demo Dashboard.

### Replacements
1. `PROJECT-CONTEXT.md`
2. `src/components/DemoWorkspaceNav.tsx`
3. `src/app/demo/dashboard/page.tsx`
4. `src/app/demo/demo-workspace.css`
5. `e2e/demo-workspace.spec.ts`

### New files
6. `src/components/demo/DemoDropdownMenu.tsx`
7. `src/components/demo/DemoLiveOperationsDashboard.tsx`
8. `src/app/demo/audit/page.tsx`
9. `src/app/demo/subscription/page.tsx`
10. `public/demo/evidence/food-line.svg`
11. `public/demo/evidence/hotel-room.svg`
12. `public/demo/evidence/maintenance.svg`
13. `public/demo/evidence/office.svg`

## What changes

- Dashboard now follows the real `LiveOperationsDashboard` hierarchy:
  - Operations snapshot
  - Recent Evidence with images
  - Live Workforce with online/offline/working states
  - Attention Required
  - Task-completion Activity Feed
  - Schedule Progress
- Demo menus close after submenu navigation.
- Demo menus also close on outside click and Escape.
- Administration now includes synthetic read-only Audit Trail and Subscription equivalents.
- No Demo operational rows are written to PostgreSQL.
- RLS remains disabled.
- Existing Task/Schedule/Property/Work Area drill-down behavior remains intact.

## Local compile checks

After upload:

```bash
npm run db:generate
npm run typecheck
npm run build
```

Do not upgrade Prisma as part of this batch.

## E2E

After Vercel deploys `v2-rebuild`, run:

GitHub → Actions → E2E V2 → Run workflow → `v2-rebuild`

Previous verified baseline:

- Demo focused: 8/8
- Full V2: 44/44

This package replaces the 8-test Demo suite with a 10-test Demo suite, so the expected total is approximately:

- Demo focused: 10/10
- Full V2: 46/46

Do not update the canonical baseline to 46/46 until the workflow actually verifies it.

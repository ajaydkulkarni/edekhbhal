# eDekhbhal — Combined Build 01

Target branch: `v2-rebuild`

This package supersedes the earlier **Action Queue Refresh Fix 01** package. Do **not** upload that older package separately.

## What this build contains

1. Dashboard Action Queue stale **Create Schedule** fix.
2. Schedule controlled-document fields:
   - **Document / SOP Reference No.**
   - **Revision / Version**
3. Immutable occurrence snapshots of those two fields for historical reporting.
4. Document reference/revision on Schedule list/detail, Service Log, Compliance detail, Occurrence detail, CSV and XLSX export.
5. Zebra-friendly **4 × 6 inch portrait Work Area QR label**:
   - eDekhbhal
   - Organization
   - Property
   - Work Area
   - QR code
   - **Scan for Service Information**
   - no printed QR ID
6. Demo Workspace equivalents for document control and 4 × 6 QR labels.
7. Demo Dashboard real-world **sample evidence photographs** from publicly licensed Wikimedia Commons sources.
8. New combined E2E regression coverage.

## Important architecture decisions preserved

- Reprint keeps the same Work Area QR identity.
- Regenerate revokes the old QR and creates a new active QR.
- No QR ID is printed on the physical label.
- A photographed/copied QR cannot be made physically uncopyable; revocation/regeneration remains the security control.
- Schedule document reference/revision are optional.
- Generated occurrences snapshot document reference/revision so completed/history records retain the checklist version in force at the time.
- RLS is **not** enabled by this build.
- Do not upgrade Prisma from 6.19.3.

---

## 1. Upload these files to `v2-rebuild`

### REPLACE existing files

- `src/app/dashboard/page.tsx`
- `src/components/ScheduleEditor.tsx`
- `src/app/api/schedules/route.ts`
- `src/app/api/schedules/[id]/route.ts`
- `src/app/api/schedules/[id]/duplicate/route.ts`
- `src/app/schedules/page.tsx`
- `src/app/schedules/[id]/page.tsx`
- `src/lib/occurrenceGenerator.ts`
- `src/app/reports/service-log/page.tsx`
- `src/app/reports/service-log/SortableServiceLogTable.tsx`
- `src/app/api/reports/service-log/export/route.ts`
- `src/app/reports/occurrences/[id]/page.tsx`
- `src/app/reports/compliance/page.tsx`
- `src/app/work-areas/page.tsx`
- `src/components/WorkAreaRowActions.tsx`
- `src/app/demo/schedules/[id]/page.tsx`
- `src/app/demo/work-areas/[id]/page.tsx`

### NEW files

- `src/components/dashboard/DashboardResumeRefresh.tsx`
- `src/components/demo/DemoQrLabel.tsx`
- `src/app/demo/work-areas/[id]/qr-label/page.tsx`
- `src/lib/demoDocumentControl.ts`
- `src/lib/productBrand.ts`
- `public/demo/evidence/SOURCES.md`
- `e2e/combined-build-01.spec.ts`
- `scripts/apply-combined-build-01.mjs`

`README-UPLOAD-ORDER.md` is documentation only.

---

## 2. Run the source updater in Codespaces

After the files above are present on `v2-rebuild`, run from the repo root:

```bash
node scripts/apply-combined-build-01.mjs
```

This intentionally updates three current branch files that are safer to patch in place than replace wholesale:

- `prisma/schema.prisma`
- `src/components/demo/DemoLiveOperationsDashboard.tsx`
- `src/app/demo/[section]/page.tsx`

The script is guarded: it fails instead of silently modifying the wrong code if the expected current `v2-rebuild` markers are not found.

After it succeeds, confirm the changed file set:

```bash
git status --short
```

---

## 3. Apply the nullable database columns and validate

Run:

```bash
npm run db:generate
npm run db:push
npm run typecheck
npm run build
```

`db:push` is required because this build adds four nullable columns:

```text
Schedule.documentReference
Schedule.documentRevision
ScheduleOccurrence.documentReferenceSnapshot
ScheduleOccurrence.documentRevisionSnapshot
```

No existing data is deleted and the fields are nullable.

Do **not** upgrade Prisma even if Prisma prints an upgrade notice.

---

## 4. Commit the updater-generated changes if using Codespaces

If the initial package files were uploaded through GitHub but the updater was run in Codespaces, commit/push the three updater-generated changes along with any remaining package changes:

```bash
git add prisma/schema.prisma \
  src/components/demo/DemoLiveOperationsDashboard.tsx \
  'src/app/demo/[section]/page.tsx'

git commit -m "complete combined build 01 source updates"
git push origin v2-rebuild
```

If those changes are already part of your current uncommitted package commit, simply add/commit all intended Combined Build 01 files together instead.

---

## 5. Deploy and run E2E V2

After Vercel has deployed the new `v2-rebuild` commit:

GitHub → Actions → **E2E V2** → Run workflow → `v2-rebuild`

The previously verified baseline is:

```text
Demo focused: 10/10
Full V2:      46/46
```

This package adds four tests in `combined-build-01.spec.ts`, so if no other tests change, the expected full-suite count is approximately **50/50**.

Do not treat 50/50 as the canonical baseline until GitHub Actions actually verifies it.

---

## Demo evidence licensing

The Demo Dashboard now references real-world photographs from Wikimedia Commons that are CC0 or public-domain. Source/license details are recorded in:

`public/demo/evidence/SOURCES.md`

They are explicitly presented as **sample evidence / real-world reference photos**, not as evidence actually captured by eDekhbhal users.

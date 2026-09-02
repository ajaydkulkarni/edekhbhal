# eDekhbhal Combined Build 02 — corrected package

Baseline: restored `v2-rebuild` after revert commit `912e17e` (functional code equivalent to verified Batch 03 baseline `c1a4317`).

This package intentionally does **not** contain partial replacement source files. The previous Combined Build 01 was reverted because several replacement files were incomplete. Build 02 uses one guarded updater that edits the current restored source in place and aborts if expected baseline markers do not match.

## Included changes

1. Action Queue refresh fix
   - Dashboard reloads live data on browser focus, pageshow and tab visibility resume.
   - The server-side duplicate-link protection remains unchanged.

2. Schedule controlled-document / ISO-support fields
   - `Document / SOP Reference No.` (optional, max 150)
   - `Revision / Version` (optional, max 100)
   - Audit snapshots include both values.
   - Future generated occurrences snapshot both values so history is not rewritten when a Schedule revision later changes.
   - Schedule list/detail, Service Log, Compliance occurrence table, Occurrence detail, CSV and XLSX export show snapshot values.
   - Demo Workspace contains realistic read-only reference/revision examples and Demo report parity.

3. Zebra 4 × 6 Work Area QR label
   - Portrait 4 in × 6 in print CSS.
   - eDekhbhal product line.
   - Organization name.
   - Property name.
   - Work Area name.
   - Large QR.
   - `Scan for Service Information` prompt.
   - No QR ID printed or displayed in the reprint modal.
   - Existing QR reprint/regenerate identity rules are unchanged.
   - Demo Workspace has a read-only 4 × 6 label preview.

4. Demo Recent Evidence photographs
   - Replaces the four illustration URLs in the Demo dashboard with real-world reference photographs related to food production, hotel housekeeping, industrial maintenance and meeting-room readiness.
   - The UI explicitly labels them `Sample evidence · real-world reference photos` so they are not represented as actual eDekhbhal captures.

5. E2E regression coverage
   - Adds `e2e/combined-build-02.spec.ts` with four focused regression tests.

## Upload

Upload these files to the **repository root** of branch `v2-rebuild`:

- `APPLY-combined-build-02.mjs`
- `SQL-combined-build-02.sql`
- `README-COMBINED-BUILD-02.md`

Do not upload the old `edekhbhal-combined-build-01` package.

## Apply source changes

In Codespaces, after pulling the GitHub upload:

```bash
git pull
node APPLY-combined-build-02.mjs
```

The script creates/updates the required source files. If a baseline marker does not match, it stops instead of silently applying an unsafe edit.

Immediately inspect what changed:

```bash
git status --short
git diff --stat
git diff --check
```

## Database

Run `SQL-combined-build-02.sql` once in the Supabase SQL Editor.

This SQL only adds four nullable columns; it does not delete or rewrite existing data.

Because the SQL is applied directly, do **not** run `npm run db:push` for this build.

## Validation

After the SQL has been applied:

```bash
npm run db:generate
npm run typecheck
npm run build
```

If all three pass, commit/push the generated source changes and run `E2E V2` in GitHub Actions.

The last verified baseline before this build is 46/46. Build 02 adds four focused tests, but no new total should be treated as verified until GitHub Actions completes successfully.

## Public reference-photo sources

The Demo uses external public image URLs rather than storing third-party files in the repository:

- Food production: Pexels photo 5953831 (Anna Shvets), marked free to use by Pexels.
- Hotel housekeeping: Pexels photo 9462786 (Liliana Drew), marked free to use by Pexels.
- Office meeting room: Pexels photo 26834971 (Bhandari Law and Partners), marked free to use by Pexels.
- Industrial maintenance: Wikimedia Commons / U.S. Navy image `US_Navy_080225-N-5484G-002...`.

These are Demo-only reference images. They are not represented as evidence captured by real users.

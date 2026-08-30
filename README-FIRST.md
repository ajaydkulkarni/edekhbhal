# eDekhbhal Fine-tuning Batch 03 — Cumulative Release

This is the cumulative fine-tuning batch requested after collecting the Dashboard, Properties, Audit, personnel-document and Reported Notes / Work Requests refinements. It is **not a version bump**; eDekhbhal remains v0.9.1 during fine-tuning.

## Included
- Dashboard top cards consolidated into one operational summary.
- Standalone Users Online tile removed; online count moved to `Who is active now`.
- Live Workforce density reduced to avoid desktop horizontal scrolling where practical.
- Recent Evidence moved to the top, one photo/video at a time, rotates every 30 seconds, and can maximize/minimize.
- Expanded Evidence overlays the Dashboard and exposes a horizontal thumbnail strip.
- Property Team Assignments refined into separate Property Manager / User columns and compact Admin assignment controls.
- Property Manager Dashboard and Schedule-create paths are scoped to assigned Properties.
- New Task/Schedule notes become explicit Reported Work Items.
- New reports appear in Dashboard Attention Required until dismissed or converted to a Schedule.
- Quick Create Schedule is prefilled to Work Area and defaults to One Time; Recurring remains available.
- Dismissed items remain in the Reported Notes / Work Requests report and can later create a Schedule while retaining dismissal history.
- Reported Work report includes reporter, time, Property, Work Area, note/context, status/history and linked Schedule.
- Audit Entity Type / Entity ID dropdowns, 25/50/75/100 rows per page, range/page footer.
- Prospective Audit IP, User-Agent and request-ID capture from request headers.
- Personnel document image thumbnails / PDF-file placeholders.
- New automated E2E coverage for the Reported Work workflow and cumulative UI refinements.
- PROJECT-CONTEXT.md is updated.
- **RLS is not enabled in this batch.**

## IMPORTANT — deployment order

1. **Run the database SQL first in Supabase STAGING.**  
   Open `batch-payload/sql/fine-tuning-batch-03.sql` from the extracted ZIP and run it in the Supabase staging SQL Editor. The SQL is idempotent.

2. After the SQL succeeds, upload the extracted batch files/folders to GitHub preserving their paths.

3. In Codespaces, use GitHub as the source:
   `git pull`

4. From the repository root:
   `bash APPLY-finetune-batch-03.sh`

5. Then:
   `bash CHECK-finetune-batch-03.sh`

6. Review `git status` and the diff. Commit the canonical applied changes and push.

7. Wait for Vercel staging to show **Success**.

8. Run GitHub → Actions → **E2E Staging** → **Run workflow**.

The previous baseline was 9 tests. Batch 03 adds 13 automated tests (9 Reported Work tests + 4 cumulative fine-tuning UI tests), so test discovery should be **22 tests** if no other tests have been added meanwhile.

## Deliberate behavior
- Existing historical Task/Schedule notes are **not automatically backfilled as NEW Dashboard work requests**. This avoids flooding Attention Required with old notes. New notes submitted after deployment enter the new workflow.
- Dismissal is history, not deletion.
- Audit request metadata is prospective; historical blank IP/User-Agent values cannot be reconstructed.
- Live Workforce retains responsive horizontal scrolling at narrower breakpoints to avoid unreadable eight-column layouts.

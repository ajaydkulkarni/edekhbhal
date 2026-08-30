# Batch 03B — Final Audit E2E locator hotfix

E2E Staging #3 passed 21 of 22 tests. The only failure is test-only: the Audit form label's accessible name includes option text, so `getByLabel("Entity Type", exact:true)` cannot match it.

This patch uses stable form selectors by `name` for the three Audit controls. No application logic, database schema, or staging configuration changes.

Upload extracted files preserving paths. Then:
git pull
bash APPLY-batch-03b.sh
bash CHECK-batch-03b.sh

If green:
git add -A
git commit -m "Fix final Batch 03 Audit E2E locator"
git push

Then run E2E Staging again. Target: 22/22.

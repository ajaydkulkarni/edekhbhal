# Batch 03A — E2E locator / Node 24 workflow hotfix

The first full Batch 03 staging E2E run reached all 22 tests: 18 passed and 4 failed because Playwright strict-mode locators were ambiguous. The underlying application assertions around those records/screens were present; this patch only narrows the selectors.

It also updates GitHub Actions from Node 20 to Node 24 and uses Node-24-compatible official actions.

Upload the extracted files to GitHub preserving paths. Then in Codespaces:
git pull
bash APPLY-batch-03a.sh
bash CHECK-batch-03a.sh

Commit/push only after CHECK is green. No database SQL is required.

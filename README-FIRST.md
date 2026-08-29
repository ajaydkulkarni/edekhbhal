# Fine-tuning Batch 02C — GitHub Actions E2E Baseline

Purpose:
- restore the missing manual GitHub Actions runner for staging E2E tests;
- record the confirmed 9/9 live staging Playwright baseline in PROJECT-CONTEXT.md.

Why the workflow payload is not inside a hidden `.github` folder:
Some upload/extraction flows skipped the hidden `.github` path in Batch 02. This package keeps the source YAML under `workflow-payload/`, and the APPLY script creates `.github/workflows/e2e-staging.yml` in the repository.

After APPLY/CHECK and commit/push, configure the same six E2E values as GitHub Actions repository secrets:
- E2E_TEST_SECRET
- E2E_ADMIN_EMAIL
- E2E_PM_EMAIL
- E2E_USER_EMAIL
- E2E_UNASSIGNED_EMAIL
(E2E_BASE_URL is fixed in the workflow to the staging URL.)

Do not paste secrets into chat.

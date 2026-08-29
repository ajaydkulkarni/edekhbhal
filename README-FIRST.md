# eDekhbhal v0.9.0 — Smart Service Compliance & Public Work Area QR

Base expected: main branch at or after the successful v0.8.1 navigation hotfix (`ad4ea3b`).

## Included

- recurring Schedule "latest due occurrence wins" supersession;
- automatic MISSED history with reason + audit;
- public Work Area QR service-status page usable by a normal phone camera;
- Work Area Web Service Status view;
- Service Compliance & Analytics report;
- occurrence notes/evidence drill-down for Admin/Property Manager;
- Service Log CSV export;
- Service Log XLSX export;
- staging migration;
- regression checklist;
- canonical PROJECT-CONTEXT update.

## Important

- Do not apply the SQL migration before automated compile checks pass.
- Do not run `npm audit fix --force`.
- No new Android APK is required for v0.9.0.
- Public QR pages intentionally exclude worker identity, notes, evidence and audit data.

## Normal workflow

From the repository root after these files have been uploaded to GitHub and pulled into Codespaces:

```bash
bash APPLY-v0.9.0.sh
bash CHECK-v0.9.0.sh
```

After the checks pass, apply:

`supabase-v0.9.0-smart-compliance.sql`

in the staging Supabase SQL Editor.

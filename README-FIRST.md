# eDekhbhal Fine-tuning Batch 01
## Audit, Personnel & Property Access Foundation

This is a development batch, not a new semantic dot release. Root application version remains v0.9.1 while the broader access-control design is validated.

Included:
- Audit filters/search/pagination/CSV/XLSX export
- rich Team Member personnel profiles
- private profile pictures and multiple ID documents
- Admin-controlled Property assignments
- Property → Team Assignments tab
- Property master-data changes restricted to Admin
- User mobile queue limited to assigned Properties
- first-stage Property-scope helper
- canonical PROJECT-CONTEXT update
- staging DB migration

After uploading extracted files to GitHub:
1. `git pull`
2. `bash APPLY-finetune-batch-01.sh`
3. `bash CHECK-finetune-batch-01.sh`
4. Only if checks are green, apply `supabase-finetune-batch-01-access-personnel.sql` to Supabase staging.
5. Commit/push/deploy and run role regression.

RLS is deliberately not enabled yet. It becomes the security gate after this application-level access model passes staging regression.

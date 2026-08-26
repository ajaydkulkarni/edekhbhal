# eDekhbhal v0.4.0 — Tasks

This release introduces organization-level reusable Tasks. The future Schedule module can associate these task definitions with individual Work Areas.

## Tasks
- Tasks belong to the Organization, not a Property or Work Area.
- ADMIN and PROPERTY_MANAGER can create, edit, inactivate/reactivate Tasks.
- USER can view Tasks read-only.
- Task Name accepts a complete sentence (up to 500 characters).
- Task Description is rich text with bold, italics, underline, bullet/numbered lists and font sizes.
- Multiple attachments can be added and removed.
- Images show image thumbnails.
- PDFs and text files use inline browser previews.
- Other files show a file-type tile and can be opened/downloaded.
- All Task and attachment changes are included in the Audit Trail.

## Staging attachment storage
For v0.4.0, attachments are stored in PostgreSQL as Base64 with a 2 MB-per-file limit. This keeps the staging deployment self-contained and avoids introducing another secret/service configuration during feature development.

Before production, move attachment binaries to Supabase Storage (or equivalent object storage) and retain only metadata/storage keys in PostgreSQL.

## Required database upgrade
Run `supabase-v0.4.0.sql` in Supabase SQL Editor **after** the v0.3.0 upgrade and before testing Tasks.

No existing Property, Work Area or QR data is changed by the upgrade.

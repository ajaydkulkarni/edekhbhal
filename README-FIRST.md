# Fine-tuning Batch 01A — Property Manager Self-Service Profile Hotfix

This is a focused staging hotfix and does not change the semantic application version.

Fix:
- Property Manager could open My Profile but received 404 from View Full Self-Service Profile.
- Root cause: the Team Member page rejected every PROPERTY_MANAGER target before allowing self-access.
- New behavior: PROPERTY_MANAGER can open their own self-service profile; access to other personnel remains restricted to USER records in assigned Property scope.
- Internal Notes remain hidden during self-service access.

Workflow:
1. Extract locally.
2. Upload the extracted files to GitHub preserving paths.
3. In Codespaces run git pull, APPLY, then CHECK.
4. No Supabase migration is required.

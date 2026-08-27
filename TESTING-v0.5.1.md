# eDekhbhal v0.5.1 staging test checklist

1. Run `supabase-v0.5.1.sql` in Supabase SQL Editor.
2. Deploy the v0.5.1 code.
3. Organization → Working Hours:
   - Leave 24×7 enabled, save.
   - Then set a restricted window and save.
4. Property → Working Hours:
   - Verify "Inherit Organization" is the default.
   - Override with a different window and save.
5. Work Area → View / Edit → Working Hours:
   - Verify "Inherit Property" is the default.
   - Override and save.
6. Create a recurring Schedule:
   - Add an End Date.
   - Add multiple Tasks and durations.
   - Confirm calculated Task start/end times.
7. Open the saved Schedule:
   - Confirm Upcoming Generated Occurrences appear only inside the effective working hours.
   - Confirm no occurrence is created after the End Date.
8. Change a Schedule duration/order or working hours:
   - Future PENDING occurrences should be reconciled.
   - Completed/In Progress records are never automatically rewritten.
9. Audit Trail:
   - Confirm Schedule edits and occurrence generation/reconciliation entries are present.
10. Batch generation:
   - Set `CRON_SECRET` in Vercel.
   - Use `vercel-cron.example.json` as the example three-times-daily schedule only if the Vercel project plan supports that cadence.

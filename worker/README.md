# Evidence Worker Transport — Foundation 03B1

This directory contains the portable Node 22 transport boundary for the Evidence processor.

03B1 deliberately does **not** run a production processing loop and does not contain image/video codecs. Its purpose is to prove the least-privilege deployment contract before media execution is added in 03B2.

The worker uses two separate identities:

- a PostgreSQL LOGIN that inherits only the `vnext_evidence_worker` NOLOGIN capability role;
- a dedicated Supabase Auth machine user with the normal `authenticated` role and **no** `app_user` / Organization Membership.

The Storage Auth subject is mapped to `EVIDENCE_WORKER_ID` in `app_private.evidence_worker_storage_principal`. Worker-only Storage RLS then requires the same worker id to hold live queue/processing leases for the exact Evidence object.

No service-role/secret API key, JWT signing secret, or Supabase S3 static credential is part of this design.

`npm run worker:evidence:probe` checks identity/capability alignment without claiming work or touching media.

Foundation 03B2 will add the queue loop, independent source hashing/MIME inspection, Sharp image normalization, FFmpeg/ffprobe video normalization/poster generation, derivative upload, and real original deletion.

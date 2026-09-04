# Evidence Worker — Real Media Processing Foundation 03B2

The Evidence worker is a separate Node 22 process/container. Long-running media work is never executed inside a Next.js request.

## Identity boundary

The worker keeps the two 03B1 identities:

- PostgreSQL LOGIN `vnext_evidence_worker_login`, inheriting only the NOLOGIN `vnext_evidence_worker` capability role;
- dedicated Supabase Auth machine user using the normal `authenticated` role and publishable key, with no `app_user` or Organization Membership.

No service-role/secret API key, JWT signing secret, Supabase S3 static key, or BYPASSRLS role is used.

## 03B2 retry/crash hardening

Migration `0020_evidence_worker_media_execution_hardening.sql` replaces two unsafe-for-real-runtime capabilities:

- the old processing claim accepted an Evidence version from the original outbox payload. A crash after claim increments the Evidence version, so a later delivery would otherwise carry a stale version and become unrecoverable;
- the old generic outbox completion command could acknowledge a delivery without proving the target Evidence had reached its required terminal state.

03B2 therefore uses:

- `claim_evidence_processing_for_event(...)` — bound to the live event id/token/worker and current Evidence version;
- `complete_evidence_worker_event_if_terminal(...)` — process events acknowledge only VERIFIED/REJECTED terminal Evidence; delete events acknowledge only DELETED originals;
- `release_evidence_processing_lease_for_retry(...)` — explicitly expires operational processing lease state without changing the Evidence version;
- `reject_evidence_processing_observation(...)` — records an independent observed mismatch/invalid source and preserves the original;
- `mark_evidence_original_deleted_for_event(...)` — acknowledges deletion only for the exact live delete delivery and server-owned event payload.

## Media pipeline

PHOTO:

- independently hashes and magic-sniffs the downloaded bytes;
- decodes with Sharp/libvips;
- auto-orients and strips metadata through re-encoding;
- produces `normalized.webp` up to 2560×2560 at quality 82;
- produces `preview.webp` up to 640×640 at quality 72.

VIDEO:

- independently hashes and magic-sniffs the downloaded bytes;
- validates the container/stream with ffprobe;
- normalizes through FFmpeg to H.264/AAC MP4 with `+faststart`;
- constrains output dimensions to a maximum 1920×1080 without changing aspect ratio;
- produces a JPEG poster/preview from the normalized MP4;
- rejects normalized output above the private bucket's 200 MiB ceiling.

The worker never constructs derivative object paths. PostgreSQL returns the exact server-owned targets created by 03B1.

## Retry behavior

Outbox and Evidence-processing leases are renewed during long work. Retry delay is bounded exponential backoff. Transient failures expire the processing lease, release the outbox delivery for retry, and allow a new event-bound processing claim to use the current Evidence version. Partial derivative uploads are cleaned up best-effort; deterministic server-owned keys make a later retry safe to overwrite.

After the configured maximum attempts, an observed source that cannot be safely processed becomes REJECTED and the original is retained.

Successful normalization marks Evidence VERIFIED and queues exact original deletion. The delete delivery removes only the exact original permitted by worker Storage RLS, then marks `original_disposition=DELETED`.

## Commands

- `npm run worker:evidence:probe` — verify DB/Auth identities and least-privilege capability contract without claiming work.
- `npm run worker:evidence:media-check` — verify Sharp/libvips + FFmpeg/ffprobe runtime availability without connecting to the database.
- `npm run worker:evidence:once` — process at most one currently available Evidence event.
- `npm run worker:evidence:run` — continuous leased worker loop.

Do not run `--once` or `--run` until migration 0020 and the updated worker capability grants have been applied and verified.

## Containers

- `worker/Dockerfile.transport` remains a probe-only identity image.
- `worker/Dockerfile` is the 03B2 production worker image and installs FFmpeg/ffprobe plus Sharp's production dependency.

Secrets belong in the deployment secret manager or ignored `.env.worker.local`; never commit them.

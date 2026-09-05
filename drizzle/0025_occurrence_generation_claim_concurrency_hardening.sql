-- 0025_occurrence_generation_claim_concurrency_hardening.sql
--
-- Purpose:
--   Remove claim-time generation-state discovery/upsert contention.
--
-- Before 0025:
--   claim_occurrence_generation_schedule() inserted/upserted every ACTIVE
--   Schedule into schedule_occurrence_generation_state before reaching
--   FOR UPDATE ... SKIP LOCKED.
--
--   A concurrent worker could therefore block on the discovery upsert
--   before SKIP LOCKED had an opportunity to skip the already-claimed row.
--
-- After 0025:
--   * Schedule creation / organization-site reassignment maintains
--     generation-state independently through a SECURITY DEFINER trigger.
--   * Existing Schedules are backfilled once.
--   * The worker claim command performs no discovery INSERT/UPSERT.
--   * Candidate acquisition remains deterministic and uses
--     FOR UPDATE OF gs SKIP LOCKED.
--   * Worker capability surface remains unchanged:
--       claim_occurrence_generation_schedule(text,integer)
--       complete_occurrence_generation_claim(uuid,uuid,text)
--       fail_occurrence_generation_claim(uuid,uuid,text,text,integer)


-- ---------------------------------------------------------------------------
-- 1. Schedule -> generation-state maintenance
-- ---------------------------------------------------------------------------

create or replace function
app_private.sync_schedule_occurrence_generation_state_from_schedule()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin

  insert into
    public.schedule_occurrence_generation_state(
      schedule_id,
      organization_id,
      site_id,
      next_run_at,
      updated_at
    )
  values(
    new.id,
    new.organization_id,
    new.site_id,
    now(),
    now()
  )

  on conflict(schedule_id)
  do update
  set
    organization_id =
      excluded.organization_id,

    site_id =
      excluded.site_id,

    updated_at =
      now()

  where
    public.schedule_occurrence_generation_state.organization_id
      is distinct from excluded.organization_id

    or

    public.schedule_occurrence_generation_state.site_id
      is distinct from excluded.site_id;


  return new;

end;
$function$;


revoke all
on function
  app_private.sync_schedule_occurrence_generation_state_from_schedule()
from public;


do $revoke$
declare
  role_name text;
begin

  foreach role_name in array array[
    'anon',
    'authenticated',
    'vnext_runtime',
    'vnext_evidence_worker',
    'vnext_occurrence_worker',
    'vnext_occurrence_worker_login'
  ]
  loop

    if to_regrole(role_name) is not null then

      execute format(
        'revoke all on function app_private.sync_schedule_occurrence_generation_state_from_schedule() from %I',
        role_name
      );

    end if;

  end loop;

end;
$revoke$;


drop trigger if exists
  schedule_occurrence_generation_state_sync
on public.schedule_master;


create trigger
  schedule_occurrence_generation_state_sync

after insert
   or update of organization_id, site_id

on public.schedule_master

for each row

execute function
  app_private.sync_schedule_occurrence_generation_state_from_schedule();


-- ---------------------------------------------------------------------------
-- 2. One-time backfill / metadata synchronization
-- ---------------------------------------------------------------------------
--
-- Backfill ALL Schedules, not only currently ACTIVE ones.
--
-- This establishes the invariant that every Schedule has a generation-state
-- row. Inactive parents remain harmless because the claim function still
-- requires ACTIVE Organization / Schedule / Site / Work Area and the
-- eligibility helper still fail-closes.
--
-- Existing attempt/history/lease/horizon fields are intentionally preserved.

insert into
  public.schedule_occurrence_generation_state(
    schedule_id,
    organization_id,
    site_id,
    next_run_at,
    updated_at
  )

select
  sm.id,
  sm.organization_id,
  sm.site_id,
  now(),
  now()

from public.schedule_master sm

on conflict(schedule_id)
do update
set
  organization_id =
    excluded.organization_id,

  site_id =
    excluded.site_id,

  updated_at =
    now()

where
  public.schedule_occurrence_generation_state.organization_id
    is distinct from excluded.organization_id

  or

  public.schedule_occurrence_generation_state.site_id
    is distinct from excluded.site_id;


-- ---------------------------------------------------------------------------
-- 3. Concurrency-safe worker claim
-- ---------------------------------------------------------------------------
--
-- IMPORTANT:
--   There is deliberately NO INSERT/UPSERT into
--   schedule_occurrence_generation_state inside this function.
--
--   Existing state is now maintained independently by the Schedule trigger.
--
--   This allows a second worker to reach FOR UPDATE ... SKIP LOCKED without
--   first contending on the state row through an ON CONFLICT UPDATE.

create or replace function
app_private.claim_occurrence_generation_schedule(
  p_worker_id text,
  p_lease_seconds integer default 120
)
returns table(
  result_schedule_id uuid,
  result_organization_id uuid,
  result_site_id uuid,
  result_claim_token uuid,
  result_lease_until timestamptz,
  result_attempt_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare

  clean_worker text :=
    nullif(
      trim(
        coalesce(
          p_worker_id,
          ''
        )
      ),
      ''
    );


  picked
    public.schedule_occurrence_generation_state%rowtype;


  v_token uuid :=
    gen_random_uuid();


  v_lease timestamptz;


  v_horizon_start timestamptz;


  v_horizon_end timestamptz;


  v_organization_id uuid;


  v_site_id uuid;


  v_attempt_count bigint;

begin

  if clean_worker is null
     or length(clean_worker) > 200
  then

    raise exception
      'Worker id is required and cannot exceed 200 characters';

  end if;


  if p_lease_seconds is null
     or p_lease_seconds < 15
     or p_lease_seconds > 300
  then

    raise exception
      'Worker lease must be between 15 and 300 seconds';

  end if;


  v_lease :=
    now()
      + make_interval(
          secs => p_lease_seconds
        );


  v_horizon_start :=
    date_trunc(
      'minute',
      now()
    );


  v_horizon_end :=
    v_horizon_start
      + interval '48 hours';


  -- Pure candidate acquisition.
  --
  -- No state discovery INSERT/UPSERT occurs before this lock.
  --
  -- Another worker holding the same generation-state row is skipped rather
  -- than waited on.

  select
    gs.*

  into
    picked

  from
    public.schedule_occurrence_generation_state gs


  join public.schedule_master sm
    on sm.id =
         gs.schedule_id


  join public.organization o
    on o.id =
         sm.organization_id


  join public.site s
    on s.id =
         sm.site_id

   and s.organization_id =
         sm.organization_id


  join public.work_area w
    on w.id =
         sm.work_area_id

   and w.organization_id =
         sm.organization_id

   and w.site_id =
         sm.site_id


  where
    o.status = 'ACTIVE'

    and sm.status = 'ACTIVE'

    and s.status = 'ACTIVE'

    and w.status = 'ACTIVE'


    and gs.next_run_at <=
          now()


    and (
      gs.worker_lease_until is null

      or gs.worker_lease_until <=
           now()
    )


    and
      app_private.schedule_generation_claim_eligible(
        gs.schedule_id,
        v_horizon_start,
        v_horizon_end
      )


  order by
    gs.next_run_at,
    gs.schedule_id


  for update of gs
    skip locked


  limit 1;


  if picked.schedule_id is null then

    return;

  end if;


  -- The row is already owned by this worker transaction at this point.
  --
  -- Synchronize organization/site from the canonical Schedule while applying
  -- the actual claim. This is intentionally AFTER SKIP LOCKED acquisition.

  update
    public.schedule_occurrence_generation_state gs

  set
    organization_id =
      sm.organization_id,

    site_id =
      sm.site_id,

    worker_claim_token =
      v_token,

    worker_id =
      clean_worker,

    worker_lease_until =
      v_lease,

    last_started_at =
      now(),

    attempt_count =
      gs.attempt_count + 1,

    last_error =
      null,

    updated_at =
      now()

  from
    public.schedule_master sm

  where
    gs.schedule_id =
      picked.schedule_id

    and sm.id =
      gs.schedule_id

  returning
    gs.organization_id,
    gs.site_id,
    gs.attempt_count

  into
    v_organization_id,
    v_site_id,
    v_attempt_count;


  if not found then

    raise exception
      'Occurrence generation Schedule disappeared during claim';

  end if;


  return query

  select
    picked.schedule_id,
    v_organization_id,
    v_site_id,
    v_token,
    v_lease,
    v_attempt_count;

end;
$function$;


-- 0023 revoked PUBLIC EXECUTE from app_private and changed future defaults.
-- Keep this replacement explicitly fail-closed as defense in depth.
revoke all
on function
  app_private.claim_occurrence_generation_schedule(text, integer)
from public;


-- No new worker GRANT is intentionally added here.
--
-- CREATE OR REPLACE preserves the existing ACL on the unchanged claim
-- function signature. The occurrence-worker capability therefore remains the
-- same exact three functions.

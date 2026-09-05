-- 0024_occurrence_generation_claim_eligibility.sql
--
-- Occurrence Rolling-Horizon Generation Worker Foundation 04A
--
-- Prevent structurally non-generatable Schedules from consuming a worker
-- claim every 15 minutes while preserving automatic re-eligibility after
-- later planning changes.
--
-- The worker capability surface remains exactly:
--
--   claim_occurrence_generation_schedule(text,integer)
--   complete_occurrence_generation_claim(uuid,uuid,text)
--   fail_occurrence_generation_claim(uuid,uuid,text,text,integer)
--
-- This migration adds one INTERNAL helper that is deliberately not granted
-- to the Occurrence worker.


create or replace function
app_private.schedule_generation_claim_eligible(
  p_schedule_id uuid,
  p_horizon_start timestamptz,
  p_horizon_end timestamptz
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  sm
    public.schedule_master%rowtype;

  hours_json jsonb;

  total_minutes integer;

  candidate_local
    timestamp without time zone;

  candidate_utc timestamptz;

  roundtrip_local
    timestamp without time zone;
begin

  if p_horizon_start is null
     or p_horizon_end is null
     or p_horizon_end <= p_horizon_start
  then
    raise exception
      'Occurrence horizon must have a positive duration';
  end if;


  if p_horizon_end - p_horizon_start >
       interval '7 days'
  then
    raise exception
      'Occurrence horizon cannot exceed 7 days';
  end if;


  select *
    into sm
  from public.schedule_master
  where id = p_schedule_id;


  if sm.id is null
     or sm.status <> 'ACTIVE'
  then
    return false;
  end if;


  select
    coalesce(
      sum(planned_duration_minutes),
      0
    )::integer
  into total_minutes
  from public.schedule_task
  where organization_id =
          sm.organization_id
    and schedule_id =
          sm.id;


  -- A Schedule without positive planned work cannot create a usable
  -- Occurrence. Keep its generation-state row so later Task changes can
  -- make it eligible automatically.
  if total_minutes <= 0 then
    return false;
  end if;


  -- Fail closed on malformed planning before calling the canonical
  -- recurrence predicate.
  if sm.frequency_type = 'RECURRING' then

    if sm.recurrence_unit is null
       or sm.recurrence_interval is null
       or sm.recurrence_interval <= 0
    then
      return false;
    end if;


    if sm.recurrence_unit = 'WEEK'
       and (
         sm.recurrence_config is null

         or jsonb_typeof(
              sm.recurrence_config
                -> 'weekdays'
            ) <> 'array'

         or jsonb_array_length(
              sm.recurrence_config
                -> 'weekdays'
            ) = 0
       )
    then
      return false;
    end if;


    if sm.recurrence_unit = 'MONTH'
       and (
         sm.recurrence_config is null

         or jsonb_typeof(
              sm.recurrence_config
                -> 'monthDays'
            ) <> 'array'

         or jsonb_array_length(
              sm.recurrence_config
                -> 'monthDays'
            ) = 0
       )
    then
      return false;
    end if;


  elsif sm.frequency_type <> 'ONE_TIME' then

    return false;

  end if;


  select
    e.hours_json
  into
    hours_json
  from
    app_private.effective_working_hours(
      sm.work_area_id
    ) e;


  /*
   * Mirror the candidate scan used by
   * reconcile_schedule_occurrences_additive_internal().
   *
   * The +/- two-hour local search padding, canonical recurrence predicate,
   * DST round-trip check, UTC horizon boundary, and working-hours fit are
   * intentionally the same.
   */
  candidate_local :=
    date_trunc(
      'minute',
      (
        p_horizon_start
          at time zone sm.timezone
      )
        - interval '2 hours'
    );


  while candidate_local <=
    date_trunc(
      'minute',
      (
        p_horizon_end
          at time zone sm.timezone
      )
        + interval '2 hours'
    )
  loop

    if app_private.schedule_candidate_matches(
      sm,
      candidate_local
    )
    then

      candidate_utc :=
        candidate_local
          at time zone sm.timezone;


      roundtrip_local :=
        candidate_utc
          at time zone sm.timezone;


      if roundtrip_local =
           candidate_local

         and candidate_utc >=
               p_horizon_start

         and candidate_utc <
               p_horizon_end

         and app_private.local_span_fits_working_hours(
               hours_json,
               candidate_local,
               total_minutes
             )
      then

        /*
         * The additive generator uses ON CONFLICT DO NOTHING for
         * (schedule_id, scheduled_start_utc).
         *
         * Therefore a claim is useful only if at least one canonical
         * candidate is not already materialized.
         */
        if not exists (
          select 1
          from public.schedule_occurrence so
          where so.schedule_id =
                  sm.id
            and so.scheduled_start_utc =
                  candidate_utc
        )
        then
          return true;
        end if;

      end if;

    end if;


    candidate_local :=
      candidate_local
        + interval '1 minute';

  end loop;


  -- No additive work exists inside this rolling horizon.
  --
  -- The generation-state row remains due. A later planning change or
  -- horizon advance can make this predicate true without repairing or
  -- recreating worker state.
  return false;

end;
$function$;


-- Internal helper only.
--
-- Migration 0023 already revoked future default PUBLIC EXECUTE, but keep
-- the boundary explicit here as defense in depth.
revoke all
on function
  app_private.schedule_generation_claim_eligible(
    uuid,
    timestamptz,
    timestamptz
  )
from public;

revoke all
on function
  app_private.schedule_generation_claim_eligible(
    uuid,
    timestamptz,
    timestamptz
  )
from anon;

revoke all
on function
  app_private.schedule_generation_claim_eligible(
    uuid,
    timestamptz,
    timestamptz
  )
from authenticated;

revoke all
on function
  app_private.schedule_generation_claim_eligible(
    uuid,
    timestamptz,
    timestamptz
  )
from vnext_runtime;

revoke all
on function
  app_private.schedule_generation_claim_eligible(
    uuid,
    timestamptz,
    timestamptz
  )
from vnext_evidence_worker;

revoke all
on function
  app_private.schedule_generation_claim_eligible(
    uuid,
    timestamptz,
    timestamptz
  )
from vnext_occurrence_worker;

revoke all
on function
  app_private.schedule_generation_claim_eligible(
    uuid,
    timestamptz,
    timestamptz
  )
from vnext_occurrence_worker_login;



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


  -- Discover newly-created active Schedules.
  --
  -- Existing state rows are retained so attempt/history data remains
  -- intact.
  insert into
    public.schedule_occurrence_generation_state(
      schedule_id,
      organization_id,
      site_id,
      next_run_at
    )
  select
    sm.id,
    sm.organization_id,
    sm.site_id,
    now()
  from public.schedule_master sm

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

  where o.status = 'ACTIVE'
    and sm.status = 'ACTIVE'
    and s.status = 'ACTIVE'
    and w.status = 'ACTIVE'

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
      is distinct from
        excluded.organization_id

    or

    public.schedule_occurrence_generation_state.site_id
      is distinct from
        excluded.site_id;


  v_lease :=
    now()
      + make_interval(
          secs =>
            p_lease_seconds
        );


  v_horizon_start :=
    date_trunc(
      'minute',
      now()
    );


  v_horizon_end :=
    v_horizon_start
      + interval '48 hours';


  select gs.*
    into picked

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

  where o.status = 'ACTIVE'
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


  update
    public.schedule_occurrence_generation_state

  set
    worker_claim_token =
      v_token,

    worker_id =
      clean_worker,

    worker_lease_until =
      v_lease,

    last_started_at =
      now(),

    attempt_count =
      attempt_count + 1,

    last_error =
      null,

    updated_at =
      now()

  where schedule_id =
          picked.schedule_id;


  return query
  select
    picked.schedule_id,
    picked.organization_id,
    picked.site_id,
    v_token,
    v_lease,
    picked.attempt_count + 1;

end;
$function$;


-- Preserve the pre-existing worker command boundary.
--
-- CREATE OR REPLACE preserves the existing explicit capability grant.
-- These revokes make the public/runtime boundary explicit.
revoke all
on function
  app_private.claim_occurrence_generation_schedule(
    text,
    integer
  )
from public;

revoke all
on function
  app_private.claim_occurrence_generation_schedule(
    text,
    integer
  )
from anon;

revoke all
on function
  app_private.claim_occurrence_generation_schedule(
    text,
    integer
  )
from authenticated;

revoke all
on function
  app_private.claim_occurrence_generation_schedule(
    text,
    integer
  )
from vnext_runtime;

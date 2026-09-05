-- Rolling Occurrence Generation Worker 04A
-- Migration 0022
--
-- Adds a least-privilege leased Schedule-generation control plane and an
-- additive 48-hour occurrence top-up path.
--
-- IMPORTANT:
--   * This worker path never rewrites existing Occurrences.
--   * This worker path never rebuilds existing Occurrence Tasks.
--   * This worker path never cancels existing work.
--   * Planning changes continue to use reconcile_schedule_occurrences(...).

create table if not exists public.schedule_occurrence_generation_state (
  schedule_id uuid primary key
    references public.schedule_master(id) on delete cascade,

  organization_id uuid not null
    references public.organization(id),

  site_id uuid not null
    references public.site(id),

  next_run_at timestamptz not null default now(),

  last_started_at timestamptz,
  last_completed_at timestamptz,

  last_horizon_start timestamptz,
  last_horizon_end timestamptz,

  worker_claim_token uuid,
  worker_id text,
  worker_lease_until timestamptz,

  attempt_count bigint not null default 0,
  last_error text,

  updated_at timestamptz not null default now(),

  constraint occurrence_generation_state_worker_id_length
    check (
      worker_id is null
      or length(worker_id) between 1 and 200
    ),

  constraint occurrence_generation_state_error_length
    check (
      last_error is null
      or length(last_error) <= 2000
    ),

  constraint occurrence_generation_state_claim_shape
    check (
      (
        worker_claim_token is null
        and worker_id is null
        and worker_lease_until is null
      )
      or
      (
        worker_claim_token is not null
        and worker_id is not null
        and worker_lease_until is not null
      )
    ),

  constraint occurrence_generation_state_horizon_shape
    check (
      (
        last_horizon_start is null
        and last_horizon_end is null
      )
      or
      (
        last_horizon_start is not null
        and last_horizon_end is not null
        and last_horizon_end > last_horizon_start
      )
    )
);

create index if not exists occurrence_generation_state_due_idx
  on public.schedule_occurrence_generation_state(
    next_run_at,
    schedule_id
  )
  where worker_claim_token is null;

revoke all
  on public.schedule_occurrence_generation_state
  from public, anon, authenticated, vnext_runtime;

alter table public.schedule_occurrence_generation_state
  enable row level security;

alter table public.schedule_occurrence_generation_state
  force row level security;


-- ===========================================================================
-- ADDITIVE OCCURRENCE TOP-UP
--
-- This deliberately shares the canonical Schedule recurrence, timezone,
-- working-hours, snapshot, and deterministic RANDOM-evidence semantics from
-- migration 0010.
--
-- The critical difference:
--
--     ON CONFLICT (...) DO NOTHING
--
-- Child Occurrence Tasks are inserted ONLY when a brand-new Occurrence was
-- inserted.
--
-- There is no UPDATE, DELETE, CANCELED transition, or child-row rebuild for
-- an existing Occurrence.
-- ===========================================================================

create or replace function
app_private.reconcile_schedule_occurrences_additive_internal(
  p_schedule_id uuid,
  p_horizon_start timestamptz,
  p_horizon_end timestamptz
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  sm public.schedule_master%rowtype;

  org_row public.organization%rowtype;
  org_name text;

  site_row public.site%rowtype;
  wa public.work_area%rowtype;

  hours_json jsonb;
  hours_source text;

  total_minutes integer;

  candidate_local timestamp without time zone;
  candidate_utc timestamptz;
  roundtrip_local timestamp without time zone;
  offset_minutes integer;

  v_occurrence_id uuid;

  generated_count integer := 0;

  st record;

  required boolean;
  required_type schedule_random_evidence_type;
  deterministic_bucket numeric;
begin
  if p_horizon_start is null
     or p_horizon_end is null
     or p_horizon_end <= p_horizon_start
  then
    raise exception
      'Occurrence horizon must have a positive duration';
  end if;

  if p_horizon_end - p_horizon_start > interval '7 days' then
    raise exception
      'Occurrence horizon cannot exceed 7 days';
  end if;


  select *
    into sm
  from public.schedule_master
  where id = p_schedule_id;

  if sm.id is null then
    raise exception 'Schedule not found';
  end if;


  select *
    into org_row
  from public.organization
  where id = sm.organization_id;

  org_name := org_row.name;


  select *
    into site_row
  from public.site
  where id = sm.site_id
    and organization_id = sm.organization_id;


  select *
    into wa
  from public.work_area
  where id = sm.work_area_id
    and organization_id = sm.organization_id
    and site_id = sm.site_id;


  select
    e.hours_json,
    e.source_level
  into
    hours_json,
    hours_source
  from app_private.effective_working_hours(sm.work_area_id) e;


  select
    coalesce(sum(planned_duration_minutes), 0)::integer
  into total_minutes
  from public.schedule_task
  where organization_id = sm.organization_id
    and schedule_id = sm.id;


  if sm.status <> 'ACTIVE'
     or org_row.id is null
     or org_row.status <> 'ACTIVE'
     or site_row.id is null
     or site_row.status <> 'ACTIVE'
     or wa.id is null
     or wa.status <> 'ACTIVE'
     or total_minutes <= 0
  then
    return 0;
  end if;


  candidate_local :=
    date_trunc(
      'minute',
      (p_horizon_start at time zone sm.timezone)
        - interval '2 hours'
    );


  while candidate_local <=
    date_trunc(
      'minute',
      (p_horizon_end at time zone sm.timezone)
        + interval '2 hours'
    )
  loop

    if app_private.schedule_candidate_matches(
      sm,
      candidate_local
    )
    then

      candidate_utc :=
        candidate_local at time zone sm.timezone;

      roundtrip_local :=
        candidate_utc at time zone sm.timezone;


      -- Reject nonexistent DST-gap local wall-clock values.
      if roundtrip_local = candidate_local
         and candidate_utc >= p_horizon_start
         and candidate_utc < p_horizon_end
         and app_private.local_span_fits_working_hours(
           hours_json,
           candidate_local,
           total_minutes
         )
      then

        offset_minutes :=
          extract(
            epoch from (
              candidate_local
              - (candidate_utc at time zone 'UTC')
            )
          ) / 60;


        -- Prevent a previous loop iteration's id from being reused if the
        -- INSERT below encounters an existing Occurrence.
        v_occurrence_id := null;


        insert into public.schedule_occurrence(
          organization_id,
          site_id,
          work_area_id,
          schedule_id,

          scheduled_start_utc,
          scheduled_end_utc,

          timezone_snapshot,
          local_date_snapshot,
          local_time_snapshot,
          utc_offset_minutes_snapshot,

          organization_name_snapshot,
          site_name_snapshot,
          work_area_name_snapshot,

          work_area_description_snapshot,
          work_area_location_snapshot,

          schedule_name_snapshot,

          document_reference_snapshot,
          document_revision_snapshot,

          schedule_version_snapshot,

          planned_duration_minutes,

          working_hours_snapshot,
          working_hours_source_snapshot,

          supersede_unstarted_snapshot,

          status,

          canceled_at,
          cancel_reason,

          updated_at
        )
        values(
          sm.organization_id,
          sm.site_id,
          sm.work_area_id,
          sm.id,

          candidate_utc,
          candidate_utc
            + make_interval(mins => total_minutes),

          sm.timezone,
          candidate_local::date,
          candidate_local::time,
          offset_minutes,

          org_name,
          site_row.name,
          wa.name,

          wa.description,
          wa.location_details,

          sm.name,

          sm.document_reference,
          sm.document_revision,

          sm.version,

          total_minutes,

          hours_json,
          hours_source,

          sm.supersede_unstarted,

          'PENDING',

          null,
          null,

          now()
        )

        on conflict(
          schedule_id,
          scheduled_start_utc
        )
        do nothing

        returning id
          into v_occurrence_id;


        -- Existing Occurrence:
        --
        --     v_occurrence_id IS NULL
        --
        -- Therefore no existing child Task can ever be touched here.
        if v_occurrence_id is not null then

          for st in
            select
              sct.*,
              tm.name as task_name,
              tm.instructions_html
            from public.schedule_task sct
            join public.task_master tm
              on tm.id = sct.task_id
             and tm.organization_id = sct.organization_id
            where sct.organization_id = sm.organization_id
              and sct.schedule_id = sm.id
            order by sct.sequence
          loop

            if st.evidence_rule = 'NONE' then

              required := false;
              required_type := null;

            elsif st.evidence_rule = 'PHOTO' then

              required := true;
              required_type := 'PHOTO';

            elsif st.evidence_rule = 'VIDEO' then

              required := true;
              required_type := 'VIDEO';

            else

              deterministic_bucket :=
                mod(
                  abs(
                    hashtextextended(
                      sm.id::text
                        || '|'
                        || candidate_local::text
                        || '|'
                        || st.task_id::text,
                      0
                    )::numeric
                  ),
                  st.random_every_n
                );

              required :=
                deterministic_bucket = 0;

              required_type :=
                case
                  when required
                    then st.random_evidence_type
                  else null
                end;

            end if;


            insert into public.schedule_occurrence_task(
              organization_id,
              site_id,
              work_area_id,

              occurrence_id,
              task_id,

              task_name_snapshot,
              task_instructions_snapshot,

              sequence,

              planned_duration_minutes,
              planned_start_offset_minutes,
              planned_end_offset_minutes,

              evidence_rule_snapshot,
              random_every_n_snapshot,
              random_evidence_type_snapshot,

              evidence_required,
              required_evidence_type,

              status
            )
            values(
              sm.organization_id,
              sm.site_id,
              sm.work_area_id,

              v_occurrence_id,
              st.task_id,

              st.task_name,
              coalesce(st.instructions_html, ''),

              st.sequence,

              st.planned_duration_minutes,
              st.planned_start_offset_minutes,
              st.planned_end_offset_minutes,

              st.evidence_rule,
              st.random_every_n,
              st.random_evidence_type,

              required,
              required_type,

              'PENDING'
            );

          end loop;


          generated_count :=
            generated_count + 1;

        end if;

      end if;

    end if;


    candidate_local :=
      candidate_local + interval '1 minute';

  end loop;


  return generated_count;
end;
$$;


revoke all
  on function
    app_private.reconcile_schedule_occurrences_additive_internal(
      uuid,
      timestamptz,
      timestamptz
    )
  from public, anon, authenticated, vnext_runtime;



-- ===========================================================================
-- LEASED GLOBAL WORKER CLAIM
-- ===========================================================================

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
as $$
declare
  clean_worker text :=
    nullif(
      trim(coalesce(p_worker_id, '')),
      ''
    );

  picked
    public.schedule_occurrence_generation_state%rowtype;

  v_token uuid :=
    gen_random_uuid();

  v_lease timestamptz;
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
  -- Existing state rows are retained so attempt/history data remains intact.
  insert into public.schedule_occurrence_generation_state(
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
    on o.id = sm.organization_id
  join public.site s
    on s.id = sm.site_id
   and s.organization_id = sm.organization_id
  join public.work_area w
    on w.id = sm.work_area_id
   and w.organization_id = sm.organization_id
   and w.site_id = sm.site_id
  where o.status = 'ACTIVE'
    and sm.status = 'ACTIVE'
    and s.status = 'ACTIVE'
    and w.status = 'ACTIVE'

  on conflict(schedule_id)
  do update
  set
    organization_id = excluded.organization_id,
    site_id = excluded.site_id,
    updated_at = now()
  where
    public.schedule_occurrence_generation_state.organization_id
      is distinct from excluded.organization_id
    or
    public.schedule_occurrence_generation_state.site_id
      is distinct from excluded.site_id;


  v_lease :=
    now()
      + make_interval(
          secs => p_lease_seconds
        );


  select gs.*
    into picked
  from public.schedule_occurrence_generation_state gs

  join public.schedule_master sm
    on sm.id = gs.schedule_id

  join public.organization o
    on o.id = sm.organization_id

  join public.site s
    on s.id = sm.site_id
   and s.organization_id = sm.organization_id

  join public.work_area w
    on w.id = sm.work_area_id
   and w.organization_id = sm.organization_id
   and w.site_id = sm.site_id

  where o.status = 'ACTIVE'
    and sm.status = 'ACTIVE'
    and s.status = 'ACTIVE'
    and w.status = 'ACTIVE'

    and gs.next_run_at <= now()

    and (
      gs.worker_lease_until is null
      or gs.worker_lease_until <= now()
    )

  order by
    gs.next_run_at,
    gs.schedule_id

  for update of gs skip locked

  limit 1;


  if picked.schedule_id is null then
    return;
  end if;


  update public.schedule_occurrence_generation_state
  set
    worker_claim_token = v_token,
    worker_id = clean_worker,
    worker_lease_until = v_lease,

    last_started_at = now(),

    attempt_count =
      attempt_count + 1,

    last_error = null,

    updated_at = now()

  where schedule_id = picked.schedule_id;


  return query
  select
    picked.schedule_id,
    picked.organization_id,
    picked.site_id,
    v_token,
    v_lease,
    picked.attempt_count + 1;
end;
$$;



-- ===========================================================================
-- CLAIM-BOUND 48-HOUR TOP-UP
--
-- The generation-state row remains locked for this whole transaction.
-- A second worker therefore cannot process the same Schedule concurrently.
-- ===========================================================================

create or replace function
app_private.complete_occurrence_generation_claim(
  p_schedule_id uuid,
  p_claim_token uuid,
  p_worker_id text
)
returns table(
  result_schedule_id uuid,
  result_generated_count integer,
  result_horizon_start timestamptz,
  result_horizon_end timestamptz,
  result_next_run_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  clean_worker text :=
    nullif(
      trim(coalesce(p_worker_id, '')),
      ''
    );

  gs
    public.schedule_occurrence_generation_state%rowtype;

  v_start timestamptz;
  v_end timestamptz;

  v_count integer;

  v_next timestamptz;
begin
  if p_schedule_id is null
     or p_claim_token is null
  then
    raise exception
      'Schedule id and claim token are required';
  end if;


  if clean_worker is null
     or length(clean_worker) > 200
  then
    raise exception
      'Worker id is required and cannot exceed 200 characters';
  end if;


  select *
    into gs
  from public.schedule_occurrence_generation_state
  where schedule_id = p_schedule_id
  for update;


  if gs.schedule_id is null then
    raise exception
      'Occurrence generation state not found';
  end if;


  if gs.worker_claim_token is distinct from p_claim_token
     or gs.worker_id is distinct from clean_worker
  then
    raise exception
      'Occurrence generation claim mismatch';
  end if;


  if gs.worker_lease_until is null
     or gs.worker_lease_until <= now()
  then
    raise exception
      'Occurrence generation lease has expired';
  end if;


  -- Canonical rolling horizon.
  v_start :=
    date_trunc(
      'minute',
      now()
    );

  v_end :=
    v_start
      + interval '48 hours';


  v_count :=
    app_private.reconcile_schedule_occurrences_additive_internal(
      p_schedule_id,
      v_start,
      v_end
    );


  -- Revisit each active Schedule every 15 minutes.
  --
  -- Because generation is additive, this does not churn existing rows.
  v_next :=
    now()
      + interval '15 minutes';


  update public.schedule_occurrence_generation_state
  set
    last_completed_at = now(),

    last_horizon_start = v_start,
    last_horizon_end = v_end,

    next_run_at = v_next,

    worker_claim_token = null,
    worker_id = null,
    worker_lease_until = null,

    last_error = null,

    updated_at = now()

  where schedule_id = p_schedule_id
    and worker_claim_token = p_claim_token
    and worker_id = clean_worker;


  if not found then
    raise exception
      'Occurrence generation claim mismatch';
  end if;


  return query
  select
    p_schedule_id,
    v_count,
    v_start,
    v_end,
    v_next;
end;
$$;



-- ===========================================================================
-- CLAIM FAILURE / RETRY
-- ===========================================================================

create or replace function
app_private.fail_occurrence_generation_claim(
  p_schedule_id uuid,
  p_claim_token uuid,
  p_worker_id text,
  p_error text,
  p_retry_after_seconds integer default 60
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  clean_worker text :=
    nullif(
      trim(coalesce(p_worker_id, '')),
      ''
    );

  clean_error text :=
    nullif(
      trim(coalesce(p_error, '')),
      ''
    );

  gs
    public.schedule_occurrence_generation_state%rowtype;
begin
  if p_schedule_id is null
     or p_claim_token is null
  then
    raise exception
      'Schedule id and claim token are required';
  end if;


  if clean_worker is null
     or length(clean_worker) > 200
  then
    raise exception
      'Worker id is required and cannot exceed 200 characters';
  end if;


  if clean_error is null
     or length(clean_error) > 2000
  then
    raise exception
      'Worker error is required and cannot exceed 2000 characters';
  end if;


  if p_retry_after_seconds is null
     or p_retry_after_seconds < 15
     or p_retry_after_seconds > 3600
  then
    raise exception
      'Retry delay must be between 15 and 3600 seconds';
  end if;


  select *
    into gs
  from public.schedule_occurrence_generation_state
  where schedule_id = p_schedule_id
  for update;


  if gs.schedule_id is null then
    raise exception
      'Occurrence generation state not found';
  end if;


  if gs.worker_claim_token is distinct from p_claim_token
     or gs.worker_id is distinct from clean_worker
  then
    raise exception
      'Occurrence generation claim mismatch';
  end if;


  if gs.worker_lease_until is null
     or gs.worker_lease_until <= now()
  then
    raise exception
      'Occurrence generation lease has expired';
  end if;


  update public.schedule_occurrence_generation_state
  set
    next_run_at =
      now()
        + make_interval(
            secs => p_retry_after_seconds
          ),

    worker_claim_token = null,
    worker_id = null,
    worker_lease_until = null,

    last_error = clean_error,

    updated_at = now()

  where schedule_id = p_schedule_id
    and worker_claim_token = p_claim_token
    and worker_id = clean_worker;


  if not found then
    raise exception
      'Occurrence generation claim mismatch';
  end if;


  return p_schedule_id;
end;
$$;



-- ===========================================================================
-- DEFAULT-DENY WORKER API
--
-- Migration 0022 intentionally grants these functions to nobody.
-- A separate NOLOGIN capability-role provisioning/grant step follows after
-- this migration has been validated.
-- ===========================================================================

revoke all
  on function
    app_private.claim_occurrence_generation_schedule(
      text,
      integer
    )
  from public, anon, authenticated, vnext_runtime;


revoke all
  on function
    app_private.complete_occurrence_generation_claim(
      uuid,
      uuid,
      text
    )
  from public, anon, authenticated, vnext_runtime;


revoke all
  on function
    app_private.fail_occurrence_generation_claim(
      uuid,
      uuid,
      text,
      text,
      integer
    )
  from public, anon, authenticated, vnext_runtime;

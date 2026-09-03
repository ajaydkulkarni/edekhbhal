-- Occurrence Foundation 01
-- Generated planning snapshot layer + effective working-hours inheritance.
-- Full mobile claim/start/evidence execution remains deliberately deferred.

do $$ begin
  create type occurrence_status as enum (
    'PENDING','IN_PROGRESS','COMPLETED','PARTIALLY_COMPLETED','MISSED','CANCELED'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type occurrence_task_status as enum (
    'PENDING','IN_PROGRESS','COMPLETED','MISSED','CANCELED'
  );
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Effective working hours
--
-- JSON shape:
-- {
--   "0":[{"start":"00:00","end":"24:00"}], ... "6":[...]
-- }
-- 0=Sunday ... 6=Saturday. Missing/empty day means closed.
-- Site/Work Area NULL means inherit.
-- ---------------------------------------------------------------------------

create or replace function app_private.default_working_hours_24x7()
returns jsonb
language sql
immutable
set search_path = pg_catalog
as $$
  select '{
    "0":[{"start":"00:00","end":"24:00"}],
    "1":[{"start":"00:00","end":"24:00"}],
    "2":[{"start":"00:00","end":"24:00"}],
    "3":[{"start":"00:00","end":"24:00"}],
    "4":[{"start":"00:00","end":"24:00"}],
    "5":[{"start":"00:00","end":"24:00"}],
    "6":[{"start":"00:00","end":"24:00"}]
  }'::jsonb
$$;

create or replace function app_private.is_valid_working_hours_json(p_hours jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  day_key text;
  item jsonb;
  start_text text;
  end_text text;
  start_minutes integer;
  end_minutes integer;
  sh integer; sm integer; eh integer; em integer;
begin
  if p_hours is null or jsonb_typeof(p_hours) <> 'object' then return false; end if;

  for day_key in select jsonb_object_keys(p_hours) loop
    if day_key not in ('0','1','2','3','4','5','6') then return false; end if;
    if jsonb_typeof(p_hours -> day_key) <> 'array' then return false; end if;

    for item in select value from jsonb_array_elements(p_hours -> day_key) loop
      if jsonb_typeof(item) <> 'object' then return false; end if;
      start_text := item ->> 'start';
      end_text := item ->> 'end';

      if start_text is null or end_text is null
         or start_text !~ '^[0-2][0-9]:[0-5][0-9]$'
         or end_text !~ '^[0-2][0-9]:[0-5][0-9]$'
      then return false; end if;

      sh := split_part(start_text, ':', 1)::integer;
      sm := split_part(start_text, ':', 2)::integer;
      eh := split_part(end_text, ':', 1)::integer;
      em := split_part(end_text, ':', 2)::integer;

      if sh > 23 then return false; end if;
      if eh > 24 or (eh = 24 and em <> 0) then return false; end if;

      start_minutes := sh * 60 + sm;
      end_minutes := eh * 60 + em;
      if start_minutes < 0 or start_minutes >= 1440
         or end_minutes <= 0 or end_minutes > 1440
         or start_minutes >= end_minutes
      then return false; end if;
    end loop;
  end loop;

  return true;
end;
$$;

alter table public.organization
  add column if not exists default_working_hours_json jsonb;

update public.organization
set default_working_hours_json = app_private.default_working_hours_24x7()
where default_working_hours_json is null;

alter table public.organization
  alter column default_working_hours_json
  set default app_private.default_working_hours_24x7();

alter table public.organization
  alter column default_working_hours_json set not null;

alter table public.site
  add column if not exists working_hours_json jsonb;

do $$ begin
  alter table public.organization
    add constraint organization_working_hours_valid
    check (app_private.is_valid_working_hours_json(default_working_hours_json));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.site
    add constraint site_working_hours_valid
    check (working_hours_json is null or app_private.is_valid_working_hours_json(working_hours_json));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.work_area
    add constraint work_area_working_hours_valid
    check (working_hours_json is null or app_private.is_valid_working_hours_json(working_hours_json));
exception when duplicate_object then null; end $$;

create or replace function app_private.effective_working_hours(p_work_area_id uuid)
returns table(hours_json jsonb, source_level text)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    coalesce(w.working_hours_json, s.working_hours_json, o.default_working_hours_json),
    case
      when w.working_hours_json is not null then 'WORK_AREA'
      when s.working_hours_json is not null then 'SITE'
      else 'ORGANIZATION'
    end
  from public.work_area w
  join public.site s
    on s.id = w.site_id and s.organization_id = w.organization_id
  join public.organization o
    on o.id = w.organization_id
  where w.id = p_work_area_id
$$;

create or replace function app_private.local_span_fits_working_hours(
  p_hours jsonb,
  p_start_local timestamp without time zone,
  p_duration_minutes integer
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  end_local timestamp without time zone;
  day_cursor date;
  end_day date;
  start_minute integer;
  end_minute integer;
  interval_item jsonb;
  interval_start integer;
  interval_end integer;
  covered boolean;
  st text;
  et text;
begin
  if p_duration_minutes is null or p_duration_minutes <= 0 then return false; end if;
  if not app_private.is_valid_working_hours_json(p_hours) then return false; end if;

  end_local := p_start_local + make_interval(mins => p_duration_minutes);
  day_cursor := p_start_local::date;
  end_day := end_local::date;

  while day_cursor <= end_day loop
    if day_cursor = p_start_local::date then
      start_minute := extract(hour from p_start_local)::integer * 60
                    + extract(minute from p_start_local)::integer;
    else
      start_minute := 0;
    end if;

    if day_cursor = end_day then
      end_minute := extract(hour from end_local)::integer * 60
                  + extract(minute from end_local)::integer;
      if end_minute = 0 and end_day > p_start_local::date then
        exit;
      end if;
    else
      end_minute := 1440;
    end if;

    covered := false;
    for interval_item in
      select value
      from jsonb_array_elements(
        coalesce(p_hours -> extract(dow from day_cursor)::integer::text, '[]'::jsonb)
      )
    loop
      st := interval_item ->> 'start';
      et := interval_item ->> 'end';
      interval_start := split_part(st, ':', 1)::integer * 60 + split_part(st, ':', 2)::integer;
      interval_end := split_part(et, ':', 1)::integer * 60 + split_part(et, ':', 2)::integer;
      if interval_start <= start_minute and interval_end >= end_minute then
        covered := true;
        exit;
      end if;
    end loop;

    if not covered then return false; end if;
    day_cursor := day_cursor + 1;
  end loop;

  return true;
end;
$$;

-- Internal helpers are not runtime APIs.
revoke all on function app_private.default_working_hours_24x7() from public;
revoke all on function app_private.is_valid_working_hours_json(jsonb) from public;
grant execute on function app_private.is_valid_working_hours_json(jsonb) to vnext_runtime;
revoke all on function app_private.effective_working_hours(uuid) from public;
revoke all on function app_private.local_span_fits_working_hours(jsonb,timestamp without time zone,integer) from public;

-- ---------------------------------------------------------------------------
-- Occurrence snapshot tables
-- ---------------------------------------------------------------------------

alter table public.schedule_master
  add column if not exists supersede_unstarted boolean not null default true;

create unique index if not exists site_org_id_uq
  on public.site(organization_id,id);
create unique index if not exists work_area_org_site_id_uq
  on public.work_area(organization_id,site_id,id);
create unique index if not exists task_master_org_id_uq
  on public.task_master(organization_id,id);
create unique index if not exists schedule_master_org_site_work_area_id_uq
  on public.schedule_master(organization_id,site_id,work_area_id,id);

-- Close the previously deferred attachment tenant-parent boundary.
do $$ begin
  alter table public.task_attachment
    add constraint task_attachment_org_task_fk
    foreign key (organization_id,task_id)
    references public.task_master(organization_id,id);
exception when duplicate_object then null; end $$;

create table if not exists public.schedule_occurrence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization(id),
  site_id uuid not null,
  work_area_id uuid not null,
  schedule_id uuid not null,

  scheduled_start_utc timestamptz not null,
  scheduled_end_utc timestamptz not null,

  timezone_snapshot text not null,
  local_date_snapshot date not null,
  local_time_snapshot time without time zone not null,
  utc_offset_minutes_snapshot integer not null,

  organization_name_snapshot text not null,
  site_name_snapshot text not null,
  work_area_name_snapshot text not null,
  work_area_description_snapshot text,
  work_area_location_snapshot text,
  schedule_name_snapshot text not null,
  document_reference_snapshot text,
  document_revision_snapshot text,
  schedule_version_snapshot bigint not null,
  planned_duration_minutes integer not null,
  working_hours_snapshot jsonb not null,
  working_hours_source_snapshot text not null,
  supersede_unstarted_snapshot boolean not null default true,

  status occurrence_status not null default 'PENDING',
  assigned_membership_id uuid references public.organization_membership(id),
  claimed_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  missed_at timestamptz,
  miss_reason text,
  canceled_at timestamptz,
  cancel_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,

  constraint schedule_occurrence_org_site_fk
    foreign key (organization_id,site_id)
    references public.site(organization_id,id),
  constraint schedule_occurrence_org_site_work_area_fk
    foreign key (organization_id,site_id,work_area_id)
    references public.work_area(organization_id,site_id,id),
  constraint schedule_occurrence_schedule_fk
    foreign key (organization_id,site_id,work_area_id,schedule_id)
    references public.schedule_master(organization_id,site_id,work_area_id,id),
  constraint schedule_occurrence_time_order
    check (scheduled_end_utc > scheduled_start_utc),
  constraint schedule_occurrence_duration_positive
    check (planned_duration_minutes > 0),
  constraint schedule_occurrence_working_hours_source
    check (working_hours_source_snapshot in ('ORGANIZATION','SITE','WORK_AREA')),
  constraint schedule_occurrence_schedule_start_uq
    unique(schedule_id,scheduled_start_utc)
);

create index if not exists schedule_occurrence_org_site_start_idx
  on public.schedule_occurrence(organization_id,site_id,scheduled_start_utc);
create index if not exists schedule_occurrence_schedule_status_idx
  on public.schedule_occurrence(schedule_id,status,scheduled_start_utc);

create table if not exists public.schedule_occurrence_task (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization(id),
  site_id uuid not null,
  work_area_id uuid not null,
  occurrence_id uuid not null references public.schedule_occurrence(id),
  task_id uuid not null,

  task_name_snapshot text not null,
  task_instructions_snapshot text not null,
  sequence integer not null,
  planned_duration_minutes integer not null,
  planned_start_offset_minutes integer not null,
  planned_end_offset_minutes integer not null,

  evidence_rule_snapshot schedule_evidence_rule not null,
  random_every_n_snapshot integer,
  random_evidence_type_snapshot schedule_random_evidence_type,
  evidence_required boolean not null,
  required_evidence_type schedule_random_evidence_type,

  status occurrence_task_status not null default 'PENDING',
  started_at timestamptz,
  completed_at timestamptz,
  completed_by_membership_id uuid references public.organization_membership(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,

  constraint occurrence_task_org_task_fk
    foreign key (organization_id,task_id)
    references public.task_master(organization_id,id),
  constraint occurrence_task_sequence_positive check (sequence > 0),
  constraint occurrence_task_duration_positive check (planned_duration_minutes > 0),
  constraint occurrence_task_offsets_valid check (
    planned_start_offset_minutes >= 0
    and planned_end_offset_minutes = planned_start_offset_minutes + planned_duration_minutes
  ),
  constraint occurrence_task_evidence_shape check (
    (evidence_rule_snapshot='NONE' and evidence_required=false and required_evidence_type is null)
    or
    (evidence_rule_snapshot='PHOTO' and evidence_required=true and required_evidence_type='PHOTO')
    or
    (evidence_rule_snapshot='VIDEO' and evidence_required=true and required_evidence_type='VIDEO')
    or
    (evidence_rule_snapshot='RANDOM' and random_every_n_snapshot between 2 and 1000
      and random_evidence_type_snapshot is not null
      and (
        (evidence_required=true and required_evidence_type=random_evidence_type_snapshot)
        or
        (evidence_required=false and required_evidence_type is null)
      )
    )
  ),
  constraint occurrence_task_occurrence_sequence_uq unique(occurrence_id,sequence)
);

create index if not exists occurrence_task_org_occurrence_idx
  on public.schedule_occurrence_task(organization_id,occurrence_id);

revoke all on public.schedule_occurrence,public.schedule_occurrence_task
  from public,anon,authenticated,vnext_runtime;
grant select on public.schedule_occurrence,public.schedule_occurrence_task to vnext_runtime;

alter table public.schedule_occurrence enable row level security;
alter table public.schedule_occurrence force row level security;
alter table public.schedule_occurrence_task enable row level security;
alter table public.schedule_occurrence_task force row level security;

drop policy if exists schedule_occurrence_select on public.schedule_occurrence;
create policy schedule_occurrence_select on public.schedule_occurrence
for select to vnext_runtime
using (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and app_private.has_site_scope(site_id)
);

drop policy if exists schedule_occurrence_task_select on public.schedule_occurrence_task;
create policy schedule_occurrence_task_select on public.schedule_occurrence_task
for select to vnext_runtime
using (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and app_private.has_site_scope(site_id)
);

-- ---------------------------------------------------------------------------
-- Correctness-first bounded recurrence reconciler
--
-- Horizon is explicitly bounded to 7 days. Production rolling generation uses
-- the canonical 48-hour horizon; a later worker may optimize candidate
-- enumeration without changing these snapshot semantics.
--
-- PostgreSQL timezone resolution is authoritative:
--   * nonexistent DST-gap local times are detected by round-trip and skipped;
--   * ambiguous overlap times use PostgreSQL's canonical AT TIME ZONE instant;
--   * the selected UTC offset is snapshotted and historical rows never shift.
-- ---------------------------------------------------------------------------

create or replace function app_private.schedule_candidate_matches(
  p_schedule public.schedule_master,
  p_candidate_local timestamp without time zone
)
returns boolean
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  start_local timestamp without time zone;
  diff_minutes bigint;
  diff_days integer;
  diff_months integer;
  diff_years integer;
  candidate_dow integer;
begin
  start_local := p_schedule.start_local_date + p_schedule.start_local_time;

  if p_candidate_local < start_local then return false; end if;
  if p_schedule.end_local_date is not null
     and p_candidate_local::date > p_schedule.end_local_date
  then return false; end if;

  if p_schedule.frequency_type = 'ONE_TIME' then
    return p_candidate_local = start_local;
  end if;

  if p_schedule.recurrence_unit = 'MINUTE' then
    diff_minutes := floor(extract(epoch from (p_candidate_local-start_local))/60)::bigint;
    return mod(diff_minutes,p_schedule.recurrence_interval)=0;
  elsif p_schedule.recurrence_unit = 'HOUR' then
    diff_minutes := floor(extract(epoch from (p_candidate_local-start_local))/60)::bigint;
    return mod(diff_minutes,p_schedule.recurrence_interval*60)=0;
  elsif p_schedule.recurrence_unit = 'DAY' then
    if p_candidate_local::time <> p_schedule.start_local_time then return false; end if;
    diff_days := p_candidate_local::date - p_schedule.start_local_date;
    return mod(diff_days,p_schedule.recurrence_interval)=0;
  elsif p_schedule.recurrence_unit = 'WEEK' then
    if p_candidate_local::time <> p_schedule.start_local_time then return false; end if;
    diff_days := p_candidate_local::date - p_schedule.start_local_date;
    if mod(floor(diff_days/7.0)::integer,p_schedule.recurrence_interval)<>0 then return false; end if;
    candidate_dow := extract(dow from p_candidate_local)::integer;
    return exists (
      select 1
      from jsonb_array_elements_text(p_schedule.recurrence_config->'weekdays') d
      where d::integer=candidate_dow
    );
  elsif p_schedule.recurrence_unit = 'MONTH' then
    if p_candidate_local::time <> p_schedule.start_local_time then return false; end if;
    diff_months :=
      (extract(year from p_candidate_local)::integer-extract(year from p_schedule.start_local_date)::integer)*12
      + extract(month from p_candidate_local)::integer-extract(month from p_schedule.start_local_date)::integer;
    if mod(diff_months,p_schedule.recurrence_interval)<>0 then return false; end if;
    return exists (
      select 1
      from jsonb_array_elements_text(p_schedule.recurrence_config->'monthDays') d
      where d::integer=extract(day from p_candidate_local)::integer
    );
  elsif p_schedule.recurrence_unit = 'YEAR' then
    if p_candidate_local::time <> p_schedule.start_local_time then return false; end if;
    diff_years := extract(year from p_candidate_local)::integer
                - extract(year from p_schedule.start_local_date)::integer;
    return mod(diff_years,p_schedule.recurrence_interval)=0
      and extract(month from p_candidate_local)::integer=extract(month from p_schedule.start_local_date)::integer
      and extract(day from p_candidate_local)::integer=extract(day from p_schedule.start_local_date)::integer;
  end if;

  return false;
end;
$$;

create or replace function app_private.reconcile_schedule_occurrences_internal(
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
  desired_starts timestamptz[] := array[]::timestamptz[];
  generated_count integer := 0;
  st record;
  required boolean;
  required_type schedule_random_evidence_type;
  deterministic_bucket numeric;
begin
  if p_horizon_start is null or p_horizon_end is null or p_horizon_end<=p_horizon_start then
    raise exception 'Occurrence horizon must have a positive duration';
  end if;
  if p_horizon_end-p_horizon_start > interval '7 days' then
    raise exception 'Occurrence horizon cannot exceed 7 days';
  end if;

  select * into sm from public.schedule_master where id=p_schedule_id;
  if sm.id is null then raise exception 'Schedule not found'; end if;

  select name into org_name
  from public.organization where id=sm.organization_id;

  select * into site_row
  from public.site
  where id=sm.site_id and organization_id=sm.organization_id;

  select * into wa
  from public.work_area
  where id=sm.work_area_id
    and organization_id=sm.organization_id
    and site_id=sm.site_id;

  select e.hours_json,e.source_level into hours_json,hours_source
  from app_private.effective_working_hours(sm.work_area_id) e;

  select coalesce(sum(planned_duration_minutes),0)::integer into total_minutes
  from public.schedule_task
  where organization_id=sm.organization_id and schedule_id=sm.id;

  if sm.status<>'ACTIVE'
     or site_row.id is null or site_row.status<>'ACTIVE'
     or wa.id is null or wa.status<>'ACTIVE'
     or total_minutes<=0
  then
    update public.schedule_occurrence
    set status='CANCELED',
        canceled_at=now(),
        cancel_reason='SCHEDULE_RECONCILED',
        updated_at=now(),
        version=version+1
    where organization_id=sm.organization_id
      and schedule_id=sm.id
      and status='PENDING'
      and assigned_membership_id is null
      and started_at is null
      and scheduled_start_utc>=p_horizon_start
      and scheduled_start_utc<p_horizon_end;

    update public.schedule_occurrence_task ot
    set status='CANCELED',updated_at=now(),version=version+1
    where ot.organization_id=sm.organization_id
      and ot.status='PENDING'
      and exists (
        select 1 from public.schedule_occurrence o
        where o.id=ot.occurrence_id
          and o.schedule_id=sm.id
          and o.status='CANCELED'
          and o.cancel_reason='SCHEDULE_RECONCILED'
          and o.scheduled_start_utc>=p_horizon_start
          and o.scheduled_start_utc<p_horizon_end
      );
    return 0;
  end if;

  -- Candidate enumeration is local-wall-clock based and bounded by the horizon.
  candidate_local := date_trunc('minute',(p_horizon_start at time zone sm.timezone)-interval '2 hours');

  while candidate_local <= date_trunc('minute',(p_horizon_end at time zone sm.timezone)+interval '2 hours') loop
    if app_private.schedule_candidate_matches(sm,candidate_local) then
      candidate_utc := candidate_local at time zone sm.timezone;
      roundtrip_local := candidate_utc at time zone sm.timezone;

      -- DST gap: local time does not survive timezone round-trip.
      if roundtrip_local = candidate_local
         and candidate_utc>=p_horizon_start
         and candidate_utc<p_horizon_end
         and app_private.local_span_fits_working_hours(hours_json,candidate_local,total_minutes)
      then
        offset_minutes :=
          extract(epoch from (candidate_local-(candidate_utc at time zone 'UTC')))/60;

        insert into public.schedule_occurrence(
          organization_id,site_id,work_area_id,schedule_id,
          scheduled_start_utc,scheduled_end_utc,
          timezone_snapshot,local_date_snapshot,local_time_snapshot,utc_offset_minutes_snapshot,
          organization_name_snapshot,site_name_snapshot,work_area_name_snapshot,
          work_area_description_snapshot,work_area_location_snapshot,schedule_name_snapshot,
          document_reference_snapshot,document_revision_snapshot,schedule_version_snapshot,
          planned_duration_minutes,working_hours_snapshot,working_hours_source_snapshot,
          supersede_unstarted_snapshot,status,
          canceled_at,cancel_reason,updated_at
        ) values (
          sm.organization_id,sm.site_id,sm.work_area_id,sm.id,
          candidate_utc,candidate_utc+make_interval(mins=>total_minutes),
          sm.timezone,candidate_local::date,candidate_local::time,offset_minutes,
          org_name,site_row.name,wa.name,wa.description,wa.location_details,sm.name,
          sm.document_reference,sm.document_revision,sm.version,
          total_minutes,hours_json,hours_source,sm.supersede_unstarted,'PENDING',
          null,null,now()
        )
        on conflict(schedule_id,scheduled_start_utc) do update set
          site_id=excluded.site_id,
          work_area_id=excluded.work_area_id,
          scheduled_end_utc=excluded.scheduled_end_utc,
          timezone_snapshot=excluded.timezone_snapshot,
          local_date_snapshot=excluded.local_date_snapshot,
          local_time_snapshot=excluded.local_time_snapshot,
          utc_offset_minutes_snapshot=excluded.utc_offset_minutes_snapshot,
          organization_name_snapshot=excluded.organization_name_snapshot,
          site_name_snapshot=excluded.site_name_snapshot,
          work_area_name_snapshot=excluded.work_area_name_snapshot,
          work_area_description_snapshot=excluded.work_area_description_snapshot,
          work_area_location_snapshot=excluded.work_area_location_snapshot,
          schedule_name_snapshot=excluded.schedule_name_snapshot,
          document_reference_snapshot=excluded.document_reference_snapshot,
          document_revision_snapshot=excluded.document_revision_snapshot,
          schedule_version_snapshot=excluded.schedule_version_snapshot,
          planned_duration_minutes=excluded.planned_duration_minutes,
          working_hours_snapshot=excluded.working_hours_snapshot,
          working_hours_source_snapshot=excluded.working_hours_source_snapshot,
          supersede_unstarted_snapshot=excluded.supersede_unstarted_snapshot,
          status='PENDING',
          canceled_at=null,
          cancel_reason=null,
          updated_at=now(),
          version=public.schedule_occurrence.version+1
        where public.schedule_occurrence.organization_id=sm.organization_id
          and public.schedule_occurrence.assigned_membership_id is null
          and public.schedule_occurrence.started_at is null
          and (
            public.schedule_occurrence.status='PENDING'
            or (
              public.schedule_occurrence.status='CANCELED'
              and public.schedule_occurrence.cancel_reason='SCHEDULE_RECONCILED'
            )
          )
        returning id into v_occurrence_id;

        desired_starts := array_append(desired_starts,candidate_utc);

        if v_occurrence_id is not null then
          delete from public.schedule_occurrence_task
          where organization_id=sm.organization_id
            and public.schedule_occurrence_task.occurrence_id=v_occurrence_id;

          for st in
            select
              sct.*,
              tm.name task_name,
              tm.instructions_html
            from public.schedule_task sct
            join public.task_master tm
              on tm.id=sct.task_id and tm.organization_id=sct.organization_id
            where sct.organization_id=sm.organization_id
              and sct.schedule_id=sm.id
            order by sct.sequence
          loop
            if st.evidence_rule='NONE' then
              required:=false; required_type:=null;
            elsif st.evidence_rule='PHOTO' then
              required:=true; required_type:='PHOTO';
            elsif st.evidence_rule='VIDEO' then
              required:=true; required_type:='VIDEO';
            else
              deterministic_bucket :=
                mod(
                  abs(hashtextextended(
                    sm.id::text||'|'||candidate_local::text||'|'||st.task_id::text,0
                  )::numeric),
                  st.random_every_n
                );
              required := deterministic_bucket=0;
              required_type := case when required then st.random_evidence_type else null end;
            end if;

            insert into public.schedule_occurrence_task(
              organization_id,site_id,work_area_id,occurrence_id,task_id,
              task_name_snapshot,task_instructions_snapshot,sequence,
              planned_duration_minutes,planned_start_offset_minutes,planned_end_offset_minutes,
              evidence_rule_snapshot,random_every_n_snapshot,random_evidence_type_snapshot,
              evidence_required,required_evidence_type,status
            ) values (
              sm.organization_id,sm.site_id,sm.work_area_id,v_occurrence_id,st.task_id,
              st.task_name,coalesce(st.instructions_html,''),st.sequence,
              st.planned_duration_minutes,st.planned_start_offset_minutes,st.planned_end_offset_minutes,
              st.evidence_rule,st.random_every_n,st.random_evidence_type,
              required,required_type,'PENDING'
            );
          end loop;

          generated_count := generated_count+1;
        end if;
      end if;
    end if;

    candidate_local := candidate_local+interval '1 minute';
  end loop;

  -- Future unstarted PENDING rows no longer desired by the current Schedule
  -- are soft-canceled. IN_PROGRESS/completed/history are never rewritten.
  update public.schedule_occurrence
  set status='CANCELED',
      canceled_at=now(),
      cancel_reason='SCHEDULE_RECONCILED',
      updated_at=now(),
      version=version+1
  where organization_id=sm.organization_id
    and schedule_id=sm.id
    and status='PENDING'
    and assigned_membership_id is null
    and started_at is null
    and scheduled_start_utc>=p_horizon_start
    and scheduled_start_utc<p_horizon_end
    and not (scheduled_start_utc=any(desired_starts));

  update public.schedule_occurrence_task ot
  set status='CANCELED',updated_at=now(),version=version+1
  where ot.organization_id=sm.organization_id
    and ot.status='PENDING'
    and exists (
      select 1 from public.schedule_occurrence o
      where o.id=ot.occurrence_id
        and o.schedule_id=sm.id
        and o.status='CANCELED'
        and o.cancel_reason='SCHEDULE_RECONCILED'
        and o.scheduled_start_utc>=p_horizon_start
        and o.scheduled_start_utc<p_horizon_end
    );

  return generated_count;
end;
$$;

revoke all on function app_private.schedule_candidate_matches(public.schedule_master,timestamp without time zone) from public;
revoke all on function app_private.reconcile_schedule_occurrences_internal(uuid,timestamptz,timestamptz) from public;
revoke all on function app_private.schedule_candidate_matches(public.schedule_master,timestamp without time zone) from vnext_runtime;
revoke all on function app_private.reconcile_schedule_occurrences_internal(uuid,timestamptz,timestamptz) from vnext_runtime;

create or replace function app_private.reconcile_schedule_occurrences(
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
  org_id uuid:=app_private.current_organization_id();
  sm public.schedule_master%rowtype;
begin
  if org_id is null or not app_private.has_active_context(org_id) then
    raise exception 'Active tenant context is required';
  end if;

  select * into sm
  from public.schedule_master
  where id=p_schedule_id and organization_id=org_id;

  if sm.id is null then raise exception 'Schedule not found'; end if;
  if app_private.current_role() not in ('ADMIN','SITE_MANAGER')
     or not app_private.has_site_scope(sm.site_id)
  then raise exception 'Schedule reconciliation permission is required'; end if;

  return app_private.reconcile_schedule_occurrences_internal(
    sm.id,p_horizon_start,p_horizon_end
  );
end;
$$;

revoke all on function app_private.reconcile_schedule_occurrences(uuid,timestamptz,timestamptz)
  from public,anon,authenticated;
grant execute on function app_private.reconcile_schedule_occurrences(uuid,timestamptz,timestamptz)
  to vnext_runtime;

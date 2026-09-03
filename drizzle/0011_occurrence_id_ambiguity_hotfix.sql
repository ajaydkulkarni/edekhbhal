-- Occurrence Foundation 01 hotfix 0011
-- Resolves PL/pgSQL variable/column ambiguity in Occurrence child snapshot creation.
-- Migration 0010 is already applied on the active vNext database.

CREATE OR REPLACE FUNCTION app_private.reconcile_schedule_occurrences_internal(p_schedule_id uuid, p_horizon_start timestamp with time zone, p_horizon_end timestamp with time zone)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
$function$;

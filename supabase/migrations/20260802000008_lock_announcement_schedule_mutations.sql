-- Make the lease check and schedule mutation one row-locking statement. If a
-- claim wins first, the edit fails; if the edit wins first, the stale claim no
-- longer matches its expected next_run_at.

create or replace function public.sync_announcement_scheduled_job(
  p_organization_id uuid,
  p_announcement_id uuid,
  p_should_run boolean,
  p_recurrence_type text,
  p_custom_days integer[],
  p_next_run_at timestamptz,
  p_metadata jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_schedule_id uuid;
begin
  if not p_should_run then
    delete from public.scheduled_jobs job
    where job.organization_id = p_organization_id
      and job.job_type = 'announcement_delivery'
      and job.target_id = p_announcement_id
      and job.processing_token is null
    returning job.id into v_schedule_id;

    if v_schedule_id is null and exists (
      select 1
      from public.scheduled_jobs job
      where job.organization_id = p_organization_id
        and job.job_type = 'announcement_delivery'
        and job.target_id = p_announcement_id
    ) then
      raise exception 'announcement_schedule_busy' using errcode = '40001';
    end if;
    return;
  end if;

  if p_next_run_at is null or p_recurrence_type is null then
    raise exception 'invalid_announcement_schedule' using errcode = '22023';
  end if;

  insert into public.scheduled_jobs (
    organization_id, job_type, target_id, recurrence_type, custom_days,
    next_run_at, metadata
  ) values (
    p_organization_id, 'announcement_delivery', p_announcement_id,
    p_recurrence_type, p_custom_days, p_next_run_at, coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (organization_id, job_type, target_id) do update
    set recurrence_type = excluded.recurrence_type,
        custom_days = excluded.custom_days,
        next_run_at = excluded.next_run_at,
        metadata = excluded.metadata,
        schedule_revision = scheduled_jobs.schedule_revision + 1
    where scheduled_jobs.processing_token is null
  returning id into v_schedule_id;

  if v_schedule_id is null then
    raise exception 'announcement_schedule_busy' using errcode = '40001';
  end if;
end;
$$;

revoke all on function public.sync_announcement_scheduled_job(uuid, uuid, boolean, text, integer[], timestamptz, jsonb)
  from public, anon;
grant execute on function public.sync_announcement_scheduled_job(uuid, uuid, boolean, text, integer[], timestamptz, jsonb)
  to authenticated, service_role;

notify pgrst, 'reload schema';

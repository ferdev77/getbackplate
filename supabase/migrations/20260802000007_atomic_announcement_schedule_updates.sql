-- Announcement content and recurrence are one mutation, and an edit cannot
-- overtake an occurrence that already owns the scheduled-job lease.

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
begin
  if exists (
    select 1
    from public.scheduled_jobs job
    where job.organization_id = p_organization_id
      and job.job_type = 'announcement_delivery'
      and job.target_id = p_announcement_id
      and job.processing_token is not null
  ) then
    raise exception 'announcement_schedule_busy' using errcode = '40001';
  end if;

  if not p_should_run then
    delete from public.scheduled_jobs job
    where job.organization_id = p_organization_id
      and job.job_type = 'announcement_delivery'
      and job.target_id = p_announcement_id;
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
        schedule_revision = scheduled_jobs.schedule_revision + 1;
end;
$$;

create or replace function public.save_announcement_transaction(
  p_organization_id uuid,
  p_announcement_id uuid,
  p_created_by uuid,
  p_title text,
  p_body text,
  p_kind text,
  p_is_featured boolean,
  p_expires_at timestamptz,
  p_publish_at timestamptz,
  p_target_scope jsonb,
  p_should_run boolean,
  p_recurrence_type text,
  p_custom_days integer[],
  p_next_run_at timestamptz,
  p_schedule_metadata jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_announcement_id uuid;
begin
  if p_announcement_id is not null then
    perform 1
    from public.announcements announcement
    where announcement.organization_id = p_organization_id
      and announcement.id = p_announcement_id
    for update;

    if not found then
      raise exception 'announcement_not_found' using errcode = 'P0002';
    end if;

    if exists (
      select 1
      from public.scheduled_jobs job
      where job.organization_id = p_organization_id
        and job.job_type = 'announcement_delivery'
        and job.target_id = p_announcement_id
        and job.processing_token is not null
    ) then
      raise exception 'announcement_schedule_busy' using errcode = '40001';
    end if;

    update public.announcements announcement
    set branch_id = null,
        title = p_title,
        body = p_body,
        kind = p_kind,
        is_featured = p_is_featured,
        expires_at = p_expires_at,
        target_scope = p_target_scope
    where announcement.organization_id = p_organization_id
      and announcement.id = p_announcement_id
    returning announcement.id into v_announcement_id;
  else
    insert into public.announcements (
      organization_id, created_by, branch_id, title, body, kind, is_featured,
      expires_at, publish_at, target_scope
    ) values (
      p_organization_id, p_created_by, null, p_title, p_body, p_kind,
      p_is_featured, p_expires_at, p_publish_at, p_target_scope
    ) returning id into v_announcement_id;
  end if;

  perform public.sync_announcement_scheduled_job(
    p_organization_id,
    v_announcement_id,
    p_should_run,
    p_recurrence_type,
    p_custom_days,
    p_next_run_at,
    p_schedule_metadata
  );

  return v_announcement_id;
end;
$$;

revoke all on function public.sync_announcement_scheduled_job(uuid, uuid, boolean, text, integer[], timestamptz, jsonb)
  from public, anon;
grant execute on function public.sync_announcement_scheduled_job(uuid, uuid, boolean, text, integer[], timestamptz, jsonb)
  to authenticated, service_role;

revoke all on function public.save_announcement_transaction(
  uuid, uuid, uuid, text, text, text, boolean, timestamptz, timestamptz,
  jsonb, boolean, text, integer[], timestamptz, jsonb
) from public, anon;
grant execute on function public.save_announcement_transaction(
  uuid, uuid, uuid, text, text, text, boolean, timestamptz, timestamptz,
  jsonb, boolean, text, integer[], timestamptz, jsonb
) to authenticated, service_role;

notify pgrst, 'reload schema';

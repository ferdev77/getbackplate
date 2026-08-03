-- Close the remaining mutation races without changing billing or integration data.

-- A recursive folder chain must either reach a root or fail closed. Tracking the
-- visited path supports arbitrary legitimate depth while also rejecting cycles.
create or replace function app_private.resolve_folder_effective_scope(
  p_org_id uuid,
  p_folder_id uuid
)
returns table (scope jsonb, source_folder_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive chain as (
    select
      folder.id,
      folder.parent_id,
      folder.access_scope,
      0 as depth,
      array[folder.id]::uuid[] as path
    from public.document_folders folder
    where folder.organization_id = p_org_id
      and folder.id = p_folder_id

    union all

    select
      folder.id,
      folder.parent_id,
      folder.access_scope,
      chain.depth + 1,
      chain.path || folder.id
    from public.document_folders folder
    join chain on folder.id = chain.parent_id
    where folder.organization_id = p_org_id
      and not folder.id = any(chain.path)
  ),
  valid_chain as (
    select exists(select 1 from chain where parent_id is null) as is_valid
  ),
  scoped as (
    select chain.id, chain.access_scope, chain.depth
    from chain
    where (
      coalesce(jsonb_typeof(coalesce(chain.access_scope, '{}'::jsonb)->'users') = 'array'
        and jsonb_array_length(coalesce(chain.access_scope, '{}'::jsonb)->'users') > 0, false)
      or coalesce(jsonb_typeof(coalesce(chain.access_scope, '{}'::jsonb)->'locations') = 'array'
        and jsonb_array_length(coalesce(chain.access_scope, '{}'::jsonb)->'locations') > 0, false)
      or coalesce(jsonb_typeof(coalesce(chain.access_scope, '{}'::jsonb)->'department_ids') = 'array'
        and jsonb_array_length(coalesce(chain.access_scope, '{}'::jsonb)->'department_ids') > 0, false)
      or coalesce(jsonb_typeof(coalesce(chain.access_scope, '{}'::jsonb)->'position_ids') = 'array'
        and jsonb_array_length(coalesce(chain.access_scope, '{}'::jsonb)->'position_ids') > 0, false)
    )
    order by chain.depth asc
    limit 1
  )
  select
    coalesce((select scoped.access_scope from scoped), '{}'::jsonb),
    (select scoped.id from scoped)
  from valid_chain
  where valid_chain.is_valid;
$$;

revoke all on function app_private.resolve_folder_effective_scope(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.can_read_document_folder(
  folder_org_id uuid,
  folder_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_effective_scope jsonb;
begin
  select resolved.scope
  into v_effective_scope
  from app_private.resolve_folder_effective_scope(folder_org_id, folder_id) resolved;

  if not found then
    return false;
  end if;

  return public.current_user_matches_document_scope(
    folder_org_id,
    null,
    v_effective_scope,
    null
  );
end;
$$;

create or replace function public.can_read_document(
  doc_org_id uuid,
  doc_branch_id uuid,
  doc_access_scope jsonb,
  doc_id uuid,
  doc_folder_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_effective_scope jsonb := coalesce(doc_access_scope, '{}'::jsonb);
  v_has_explicit_scope boolean;
begin
  v_has_explicit_scope :=
    coalesce(jsonb_typeof(v_effective_scope->'users') = 'array'
      and jsonb_array_length(v_effective_scope->'users') > 0, false)
    or coalesce(jsonb_typeof(v_effective_scope->'locations') = 'array'
      and jsonb_array_length(v_effective_scope->'locations') > 0, false)
    or coalesce(jsonb_typeof(v_effective_scope->'department_ids') = 'array'
      and jsonb_array_length(v_effective_scope->'department_ids') > 0, false)
    or coalesce(jsonb_typeof(v_effective_scope->'position_ids') = 'array'
      and jsonb_array_length(v_effective_scope->'position_ids') > 0, false);

  if not v_has_explicit_scope and doc_folder_id is not null then
    select resolved.scope
    into v_effective_scope
    from app_private.resolve_folder_effective_scope(doc_org_id, doc_folder_id) resolved;

    if not found then
      return false;
    end if;
  end if;

  return public.current_user_matches_document_scope(
    doc_org_id,
    doc_branch_id,
    v_effective_scope,
    doc_id
  );
end;
$$;

create or replace function public.resolve_folder_effective_scope(
  p_org_id uuid,
  p_folder_id uuid
)
returns table (scope jsonb, source_folder_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_scope jsonb;
  v_source_folder_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' and auth.uid() is null then
    return;
  end if;

  select resolved.scope, resolved.source_folder_id
  into v_scope, v_source_folder_id
  from app_private.resolve_folder_effective_scope(p_org_id, p_folder_id) resolved;

  if not found then
    return;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not public.current_user_matches_document_scope(p_org_id, null, v_scope, null) then
    return;
  end if;

  return query select v_scope, v_source_folder_id;
end;
$$;

revoke all on function public.can_read_document_folder(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.can_read_document(uuid, uuid, jsonb, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.resolve_folder_effective_scope(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.can_read_document_folder(uuid, uuid) to authenticated;
grant execute on function public.can_read_document(uuid, uuid, jsonb, uuid, uuid) to authenticated;
grant execute on function public.resolve_folder_effective_scope(uuid, uuid) to authenticated, service_role;

-- Replace all sections as one transaction. The template row lock conflicts with
-- the share lock taken by submit_checklist_transaction, closing the validation
-- versus replacement race.
create or replace function public.replace_checklist_sections_transaction(
  p_organization_id uuid,
  p_template_id uuid,
  p_sections jsonb,
  p_expected_cycle_submissions integer default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_section jsonb;
  v_item jsonb;
  v_section_id uuid;
  v_section_order integer := 0;
  v_item_order integer;
  v_current_cycle_submissions integer;
  v_label text;
  v_requested_item_id uuid;
begin
  if jsonb_typeof(p_sections) is distinct from 'array'
    or jsonb_array_length(p_sections) = 0
    or jsonb_array_length(p_sections) > 20 then
    raise exception 'invalid_checklist_sections' using errcode = '22023';
  end if;

  perform 1
  from public.checklist_templates template
  where template.id = p_template_id
    and template.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'checklist_template_not_found' using errcode = 'P0002';
  end if;

  if p_expected_cycle_submissions is not null then
    select public.checklist_current_cycle_submissions(p_organization_id, p_template_id)
    into v_current_cycle_submissions;

    if v_current_cycle_submissions <> p_expected_cycle_submissions then
      raise exception 'checklist_cycle_changed' using errcode = '40001';
    end if;
  end if;

  for v_section in select value from jsonb_array_elements(p_sections) loop
    if jsonb_typeof(v_section) is distinct from 'object'
      or jsonb_typeof(v_section->'items') is distinct from 'array'
      or jsonb_array_length(v_section->'items') = 0
      or btrim(coalesce(v_section->>'name', '')) = '' then
      raise exception 'invalid_checklist_sections' using errcode = '22023';
    end if;

    for v_item in select value from jsonb_array_elements(v_section->'items') loop
      v_label := btrim(coalesce(v_item->>'text', v_item->>'label', case when jsonb_typeof(v_item) = 'string' then v_item #>> '{}' end, ''));
      if v_label = '' then
        raise exception 'invalid_checklist_sections' using errcode = '22023';
      end if;
    end loop;
  end loop;

  delete from public.checklist_template_sections section
  where section.organization_id = p_organization_id
    and section.template_id = p_template_id;

  for v_section in select value from jsonb_array_elements(p_sections) loop
    insert into public.checklist_template_sections (
      organization_id, template_id, name, sort_order
    ) values (
      p_organization_id, p_template_id, btrim(v_section->>'name'), v_section_order
    ) returning id into v_section_id;

    v_item_order := 0;
    for v_item in select value from jsonb_array_elements(v_section->'items') loop
      v_label := btrim(coalesce(v_item->>'text', v_item->>'label', case when jsonb_typeof(v_item) = 'string' then v_item #>> '{}' end, ''));
      begin
        v_requested_item_id := nullif(v_item->>'id', '')::uuid;
      exception when invalid_text_representation then
        raise exception 'invalid_checklist_sections' using errcode = '22023';
      end;

      insert into public.checklist_template_items (
        id, organization_id, section_id, label, priority, sort_order
      ) values (
        coalesce(v_requested_item_id, gen_random_uuid()),
        p_organization_id,
        v_section_id,
        v_label,
        'medium',
        v_item_order
      );
      v_item_order := v_item_order + 1;
    end loop;
    v_section_order := v_section_order + 1;
  end loop;

  update public.checklist_templates template
  set pending_sections = null, pending_since = null
  where template.id = p_template_id
    and template.organization_id = p_organization_id;
end;
$$;

revoke all on function public.replace_checklist_sections_transaction(uuid, uuid, jsonb, integer)
  from public, anon;
grant execute on function public.replace_checklist_sections_transaction(uuid, uuid, jsonb, integer)
  to authenticated, service_role;

-- One logical schedule per target makes sync an atomic upsert instead of a
-- lookup followed by a racing insert.
delete from public.scheduled_jobs duplicate
using public.scheduled_jobs keeper
where duplicate.organization_id = keeper.organization_id
  and duplicate.job_type = keeper.job_type
  and duplicate.target_id = keeper.target_id
  and (duplicate.updated_at, duplicate.id) < (keeper.updated_at, keeper.id);

create unique index if not exists scheduled_jobs_org_type_target_uk
  on public.scheduled_jobs (organization_id, job_type, target_id);

alter table public.scheduled_jobs
  add column if not exists processing_token uuid,
  add column if not exists processing_started_at timestamptz,
  add column if not exists schedule_revision bigint not null default 0;

create index if not exists scheduled_jobs_processing_idx
  on public.scheduled_jobs (processing_started_at)
  where processing_token is not null;

create or replace function public.claim_scheduled_job(
  p_organization_id uuid,
  p_job_id uuid,
  p_expected_next_run_at timestamptz,
  p_processing_token uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  with claimed as (
    update public.scheduled_jobs job
    set processing_token = p_processing_token,
        processing_started_at = clock_timestamp()
    where job.organization_id = p_organization_id
      and job.id = p_job_id
      and job.is_active = true
      and job.next_run_at = p_expected_next_run_at
      and job.next_run_at <= clock_timestamp()
      and (
        job.processing_token is null
        or job.processing_started_at < clock_timestamp() - interval '1 hour'
      )
    returning 1
  )
  select exists(select 1 from claimed);
$$;

create or replace function public.complete_scheduled_job(
  p_organization_id uuid,
  p_job_id uuid,
  p_processing_token uuid,
  p_expected_revision bigint,
  p_next_run_at timestamptz,
  p_last_run_at timestamptz
)
returns boolean
language sql
security definer
set search_path = public
as $$
  with completed as (
    update public.scheduled_jobs job
    set next_run_at = p_next_run_at,
        last_run_at = p_last_run_at,
        processing_token = null,
        processing_started_at = null
    where job.organization_id = p_organization_id
      and job.id = p_job_id
      and job.processing_token = p_processing_token
      and job.schedule_revision = p_expected_revision
    returning 1
  )
  select exists(select 1 from completed);
$$;

create or replace function public.release_scheduled_job(
  p_organization_id uuid,
  p_job_id uuid,
  p_processing_token uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  with released as (
    update public.scheduled_jobs job
    set processing_token = null,
        processing_started_at = null
    where job.organization_id = p_organization_id
      and job.id = p_job_id
      and job.processing_token = p_processing_token
    returning 1
  )
  select exists(select 1 from released);
$$;

revoke all on function public.claim_scheduled_job(uuid, uuid, timestamptz, uuid)
  from public, anon, authenticated;
revoke all on function public.complete_scheduled_job(uuid, uuid, uuid, bigint, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function public.release_scheduled_job(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_scheduled_job(uuid, uuid, timestamptz, uuid) to service_role;
grant execute on function public.complete_scheduled_job(uuid, uuid, uuid, bigint, timestamptz, timestamptz) to service_role;
grant execute on function public.release_scheduled_job(uuid, uuid, uuid) to service_role;

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

revoke all on function public.sync_announcement_scheduled_job(uuid, uuid, boolean, text, integer[], timestamptz, jsonb)
  from public, anon;
grant execute on function public.sync_announcement_scheduled_job(uuid, uuid, boolean, text, integer[], timestamptz, jsonb)
  to authenticated, service_role;

-- Metadata, sections, pending state, and the schedule commit together. As a
-- security-invoker function this keeps the same RLS checks as the former direct
-- table writes for authenticated company users.
create or replace function public.save_checklist_template_transaction(
  p_organization_id uuid,
  p_template_id uuid,
  p_created_by uuid,
  p_name text,
  p_checklist_type text,
  p_branch_id uuid,
  p_shift text,
  p_department text,
  p_department_id uuid,
  p_repeat_every text,
  p_target_scope jsonb,
  p_is_active boolean,
  p_sections jsonb,
  p_defer_sections boolean,
  p_expected_cycle_submissions integer,
  p_recurrence_type text,
  p_custom_days integer[],
  p_next_run_at timestamptz
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_template_id uuid;
  v_schedule_id uuid;
  v_current_cycle_submissions integer;
begin
  if p_template_id is not null then
    perform 1
    from public.checklist_templates template
    where template.id = p_template_id
      and template.organization_id = p_organization_id
    for update;

    if not found then
      raise exception 'checklist_template_not_found' using errcode = 'P0002';
    end if;

    if p_expected_cycle_submissions is not null then
      select public.checklist_current_cycle_submissions(p_organization_id, p_template_id)
      into v_current_cycle_submissions;
      if v_current_cycle_submissions <> p_expected_cycle_submissions then
        raise exception 'checklist_cycle_changed' using errcode = '40001';
      end if;
    end if;

    update public.checklist_templates template
    set branch_id = p_branch_id,
        name = p_name,
        checklist_type = p_checklist_type,
        shift = p_shift,
        department = p_department,
        department_id = p_department_id,
        repeat_every = p_repeat_every,
        target_scope = p_target_scope,
        is_active = p_is_active,
        pending_sections = case when p_defer_sections then p_sections else template.pending_sections end,
        pending_since = case when p_defer_sections then clock_timestamp() else template.pending_since end
    where template.id = p_template_id
      and template.organization_id = p_organization_id
    returning template.id into v_template_id;
  else
    if p_defer_sections then
      raise exception 'invalid_checklist_sections' using errcode = '22023';
    end if;

    insert into public.checklist_templates (
      organization_id, created_by, branch_id, name, checklist_type, shift,
      department, department_id, repeat_every, target_scope, is_active
    ) values (
      p_organization_id, p_created_by, p_branch_id, p_name, p_checklist_type, p_shift,
      p_department, p_department_id, p_repeat_every, p_target_scope, p_is_active
    ) returning id into v_template_id;
  end if;

  if p_is_active and p_recurrence_type <> 'none' then
    if p_next_run_at is null then
      raise exception 'invalid_checklist_schedule' using errcode = '22023';
    end if;

    insert into public.scheduled_jobs (
      organization_id, job_type, target_id, recurrence_type, custom_days, next_run_at
    ) values (
      p_organization_id, 'checklist_generator', v_template_id,
      p_recurrence_type, p_custom_days, p_next_run_at
    )
    on conflict (organization_id, job_type, target_id) do update
      set recurrence_type = excluded.recurrence_type,
          custom_days = excluded.custom_days,
          next_run_at = excluded.next_run_at,
          schedule_revision = scheduled_jobs.schedule_revision + 1
      where scheduled_jobs.processing_token is null
    returning id into v_schedule_id;

    if v_schedule_id is null then
      raise exception 'checklist_schedule_busy' using errcode = '40001';
    end if;
  else
    if exists (
      select 1 from public.scheduled_jobs job
      where job.organization_id = p_organization_id
        and job.job_type = 'checklist_generator'
        and job.target_id = v_template_id
        and job.processing_token is not null
    ) then
      raise exception 'checklist_schedule_busy' using errcode = '40001';
    end if;

    delete from public.scheduled_jobs job
    where job.organization_id = p_organization_id
      and job.job_type = 'checklist_generator'
      and job.target_id = v_template_id;
  end if;

  if not p_defer_sections then
    perform public.replace_checklist_sections_transaction(
      p_organization_id,
      v_template_id,
      p_sections,
      null
    );
  end if;

  return v_template_id;
end;
$$;

revoke all on function public.save_checklist_template_transaction(
  uuid, uuid, uuid, text, text, uuid, text, text, uuid, text, jsonb, boolean,
  jsonb, boolean, integer, text, integer[], timestamptz
) from public, anon;
grant execute on function public.save_checklist_template_transaction(
  uuid, uuid, uuid, text, text, uuid, text, text, uuid, text, jsonb, boolean,
  jsonb, boolean, integer, text, integer[], timestamptz
) to authenticated, service_role;

create or replace function app_private.employee_location_scope(
  p_organization_id uuid,
  p_actor_id uuid
)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  with employee_memberships as (
    select membership.branch_id, membership.location_scope_ids, membership.all_locations
    from public.memberships membership
    join public.roles role on role.id = membership.role_id
    where membership.organization_id = p_organization_id
      and membership.user_id = p_actor_id
      and membership.status = 'active'
      and role.code = 'employee'
  ),
  employee_record as (
    select employee.branch_id, employee.location_scope_ids, employee.all_locations
    from public.employees employee
    where employee.organization_id = p_organization_id
      and employee.user_id = p_actor_id
      and exists (select 1 from employee_memberships)
  ),
  sources as (
    select * from employee_memberships
    union all
    select * from employee_record
  ),
  requested_ids as (
    select source.branch_id as id from sources source where source.branch_id is not null
    union
    select scope_id
    from sources source
    cross join lateral unnest(coalesce(source.location_scope_ids, '{}'::uuid[])) scope_id
  )
  select coalesce(array_agg(branch.id order by branch.id), '{}'::uuid[])
  from public.branches branch
  where branch.organization_id = p_organization_id
    and branch.is_active = true
    and (
      exists (select 1 from sources source where source.all_locations = true)
      or branch.id in (select requested_ids.id from requested_ids)
    );
$$;

revoke all on function app_private.employee_location_scope(uuid, uuid)
  from public, anon, authenticated, service_role;

-- Employee updates replace only the visible portion of a vendor's location
-- assignment. Locations outside the employee's scope remain untouched.
create or replace function public.save_employee_vendor_transaction(
  p_organization_id uuid,
  p_vendor_id uuid,
  p_actor_id uuid,
  p_patch jsonb,
  p_replace_locations boolean,
  p_branch_ids uuid[],
  p_employee_scope_ids uuid[]
)
returns table (
  vendor_id uuid,
  vendor_name text,
  branch_ids uuid[],
  is_global boolean,
  created boolean,
  branches_changed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_branch_ids uuid[] := '{}'::uuid[];
  v_existing_is_global boolean := false;
  v_merged_branch_ids uuid[];
  v_authorized_scope_ids uuid[];
begin
  select app_private.employee_location_scope(p_organization_id, p_actor_id)
  into v_authorized_scope_ids;

  if p_vendor_id is null or cardinality(v_authorized_scope_ids) = 0 then
    raise exception 'vendor_employee_scope_empty' using errcode = '42501';
  end if;

  if p_employee_scope_ids is null
    or v_authorized_scope_ids is distinct from (
      select coalesce(array_agg(distinct id order by id), '{}'::uuid[])
      from unnest(p_employee_scope_ids) id
    ) then
    raise exception 'vendor_location_out_of_scope' using errcode = '42501';
  end if;

  perform 1
  from public.vendors vendor
  where vendor.id = p_vendor_id
    and vendor.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'vendor_not_found' using errcode = 'P0002';
  end if;

  select
    coalesce(array_agg(location.branch_id order by location.branch_id)
      filter (where location.branch_id is not null), '{}'::uuid[]),
    coalesce(bool_or(location.branch_id is null), false)
  into v_existing_branch_ids, v_existing_is_global
  from public.vendor_locations location
  where location.vendor_id = p_vendor_id
    and location.organization_id = p_organization_id;

  if not v_existing_is_global and not exists (
    select 1 from unnest(v_existing_branch_ids) id where id = any(v_authorized_scope_ids)
  ) then
    raise exception 'vendor_out_of_scope' using errcode = '42501';
  end if;

  if p_replace_locations then
    if v_existing_is_global then
      raise exception 'vendor_global_scope' using errcode = '42501';
    end if;
    if p_branch_ids is null or cardinality(p_branch_ids) = 0
      or exists (select 1 from unnest(p_branch_ids) id where id is null or not id = any(v_authorized_scope_ids)) then
      raise exception 'vendor_location_out_of_scope' using errcode = '42501';
    end if;

    select coalesce(array_agg(distinct id order by id), '{}'::uuid[])
    into v_merged_branch_ids
    from (
      select id from unnest(p_branch_ids) id
      union all
      select id from unnest(v_existing_branch_ids) id where not id = any(v_authorized_scope_ids)
    ) merged;
  else
    v_merged_branch_ids := null;
  end if;

  return query
  select * from public.save_vendor_transaction(
    p_organization_id,
    p_vendor_id,
    p_actor_id,
    p_patch,
    p_replace_locations,
    v_merged_branch_ids,
    null
  );
end;
$$;

create or replace function public.delete_employee_vendor_transaction(
  p_organization_id uuid,
  p_vendor_id uuid,
  p_actor_id uuid,
  p_employee_scope_ids uuid[]
)
returns table (vendor_name text, branch_ids uuid[], is_global boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendor_name text;
  v_branch_ids uuid[] := '{}'::uuid[];
  v_is_global boolean := false;
  v_authorized_scope_ids uuid[];
begin
  select app_private.employee_location_scope(p_organization_id, p_actor_id)
  into v_authorized_scope_ids;

  if cardinality(v_authorized_scope_ids) = 0 then
    raise exception 'vendor_employee_scope_empty' using errcode = '42501';
  end if;

  if p_employee_scope_ids is null
    or v_authorized_scope_ids is distinct from (
      select coalesce(array_agg(distinct id order by id), '{}'::uuid[])
      from unnest(p_employee_scope_ids) id
    ) then
    raise exception 'vendor_location_out_of_scope' using errcode = '42501';
  end if;

  select vendor.name into v_vendor_name
  from public.vendors vendor
  where vendor.id = p_vendor_id
    and vendor.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'vendor_not_found' using errcode = 'P0002';
  end if;

  select
    coalesce(array_agg(location.branch_id order by location.branch_id)
      filter (where location.branch_id is not null), '{}'::uuid[]),
    coalesce(bool_or(location.branch_id is null), false)
  into v_branch_ids, v_is_global
  from public.vendor_locations location
  where location.vendor_id = p_vendor_id
    and location.organization_id = p_organization_id;

  if not v_is_global and not exists (
    select 1 from unnest(v_branch_ids) id where id = any(v_authorized_scope_ids)
  ) then
    raise exception 'vendor_out_of_scope' using errcode = '42501';
  end if;

  if v_is_global or exists (
    select 1 from unnest(v_branch_ids) id where not id = any(v_authorized_scope_ids)
  ) then
    raise exception 'vendor_out_of_scope' using errcode = '42501';
  end if;

  delete from public.vendors vendor
  where vendor.id = p_vendor_id
    and vendor.organization_id = p_organization_id;

  vendor_name := v_vendor_name;
  branch_ids := v_branch_ids;
  is_global := v_is_global;
  return next;
end;
$$;

revoke all on function public.save_employee_vendor_transaction(uuid, uuid, uuid, jsonb, boolean, uuid[], uuid[])
  from public, anon, authenticated;
revoke all on function public.delete_employee_vendor_transaction(uuid, uuid, uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.save_employee_vendor_transaction(uuid, uuid, uuid, jsonb, boolean, uuid[], uuid[])
  to service_role;
grant execute on function public.delete_employee_vendor_transaction(uuid, uuid, uuid, uuid[])
  to service_role;

notify pgrst, 'reload schema';

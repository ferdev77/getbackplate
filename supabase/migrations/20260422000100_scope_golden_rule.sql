create or replace function public.announcement_scope_match(
  scope jsonb,
  member_user_id uuid,
  member_branch_id uuid,
  employee_department_id uuid,
  employee_position_ids text[] default '{}'::text[]
)
returns boolean
language sql
stable
as $$
  with prepared as (
    select coalesce(scope, '{}'::jsonb) as value
  ), lengths as (
    select
      jsonb_array_length(coalesce(value->'users', '[]'::jsonb)) as users_len,
      jsonb_array_length(coalesce(value->'locations', '[]'::jsonb)) as locations_len,
      jsonb_array_length(coalesce(value->'department_ids', '[]'::jsonb)) as departments_len,
      jsonb_array_length(coalesce(value->'position_ids', '[]'::jsonb)) as positions_len,
      value
    from prepared
  )
  select case
    when users_len > 0 and exists (
      select 1
      from jsonb_array_elements_text(coalesce(value->'users', '[]'::jsonb)) as scoped_user(item)
      where scoped_user.item = member_user_id::text
    ) then true
    when (locations_len + departments_len + positions_len) = 0 then true
    else
      (
        locations_len = 0
        or (
          member_branch_id is not null
          and exists (
            select 1
            from jsonb_array_elements_text(coalesce(value->'locations', '[]'::jsonb)) as scoped_location(item)
            where scoped_location.item = member_branch_id::text
          )
        )
      )
      and (
        departments_len = 0
        or (
          employee_department_id is not null
          and exists (
            select 1
            from jsonb_array_elements_text(coalesce(value->'department_ids', '[]'::jsonb)) as scoped_department(item)
            where scoped_department.item = employee_department_id::text
          )
        )
      )
      and (
        positions_len = 0
        or (
          coalesce(array_length(employee_position_ids, 1), 0) > 0
          and exists (
            select 1
            from jsonb_array_elements_text(coalesce(value->'position_ids', '[]'::jsonb)) as scoped_position(item)
            where scoped_position.item = any(employee_position_ids)
          )
        )
      )
  end
  from lengths;
$$;

create or replace function public.checklist_scope_match(
  scope jsonb,
  member_user_id uuid,
  member_branch_id uuid,
  employee_department_id uuid,
  employee_position_ids text[] default '{}'::text[]
)
returns boolean
language sql
stable
as $$
  with prepared as (
    select coalesce(scope, '{}'::jsonb) as value
  ), lengths as (
    select
      jsonb_array_length(coalesce(value->'users', '[]'::jsonb)) as users_len,
      jsonb_array_length(coalesce(value->'locations', '[]'::jsonb)) as locations_len,
      jsonb_array_length(coalesce(value->'department_ids', '[]'::jsonb)) as departments_len,
      jsonb_array_length(coalesce(value->'position_ids', '[]'::jsonb)) as positions_len,
      value
    from prepared
  )
  select case
    when users_len > 0 and exists (
      select 1
      from jsonb_array_elements_text(coalesce(value->'users', '[]'::jsonb)) as scoped_user(item)
      where scoped_user.item = member_user_id::text
    ) then true
    when (locations_len + departments_len + positions_len) = 0 then true
    else
      (
        locations_len = 0
        or (
          member_branch_id is not null
          and exists (
            select 1
            from jsonb_array_elements_text(coalesce(value->'locations', '[]'::jsonb)) as scoped_location(item)
            where scoped_location.item = member_branch_id::text
          )
        )
      )
      and (
        departments_len = 0
        or (
          employee_department_id is not null
          and exists (
            select 1
            from jsonb_array_elements_text(coalesce(value->'department_ids', '[]'::jsonb)) as scoped_department(item)
            where scoped_department.item = employee_department_id::text
          )
        )
      )
      and (
        positions_len = 0
        or (
          coalesce(array_length(employee_position_ids, 1), 0) > 0
          and exists (
            select 1
            from jsonb_array_elements_text(coalesce(value->'position_ids', '[]'::jsonb)) as scoped_position(item)
            where scoped_position.item = any(employee_position_ids)
          )
        )
      )
  end
  from lengths;
$$;

create or replace function public.can_read_document(
  doc_org_id uuid,
  doc_branch_id uuid,
  doc_access_scope jsonb,
  doc_id uuid
)
returns boolean
language plpgsql
stable
as $$
declare
  v_user_id uuid := auth.uid();
  v_role_code text;
  v_membership_branch_id uuid;
  v_employee_id uuid;
  v_employee_branch_id uuid;
  v_effective_branch_id uuid;
  v_employee_department_id uuid;
  v_employee_position text;
  v_employee_position_ids text[] := '{}'::text[];
  v_has_users boolean := false;
  v_has_locations boolean := false;
  v_has_departments boolean := false;
  v_has_positions boolean := false;
begin
  if v_user_id is null then
    return false;
  end if;

  if public.is_superadmin() or public.can_manage_org(doc_org_id) then
    return true;
  end if;

  if not public.has_org_membership(doc_org_id) then
    return false;
  end if;

  select r.code, m.branch_id
    into v_role_code, v_membership_branch_id
  from public.memberships m
  join public.roles r on r.id = m.role_id
  where m.organization_id = doc_org_id
    and m.user_id = v_user_id
    and m.status = 'active'
  limit 1;

  if v_role_code in ('company_admin') then
    return true;
  end if;

  select e.id, e.branch_id, e.department_id, e.position
    into v_employee_id, v_employee_branch_id, v_employee_department_id, v_employee_position
  from public.employees e
  where e.organization_id = doc_org_id
    and e.user_id = v_user_id
  limit 1;

  v_effective_branch_id := coalesce(v_membership_branch_id, v_employee_branch_id);

  if v_employee_id is not null then
    if exists (
      select 1
      from public.employee_documents ed
      where ed.organization_id = doc_org_id
        and ed.employee_id = v_employee_id
        and ed.document_id = doc_id
    ) then
      return true;
    end if;
  end if;

  if coalesce(nullif(trim(v_employee_position), ''), '') <> '' then
    select coalesce(array_agg(dp.id::text), '{}'::text[])
      into v_employee_position_ids
    from public.department_positions dp
    where dp.organization_id = doc_org_id
      and dp.is_active = true
      and lower(trim(dp.name)) = lower(trim(v_employee_position))
      and (
        v_employee_department_id is null
        or dp.department_id = v_employee_department_id
      );
  end if;

  v_has_users := jsonb_typeof(coalesce(doc_access_scope, '{}'::jsonb)->'users') = 'array'
    and jsonb_array_length(coalesce(doc_access_scope, '{}'::jsonb)->'users') > 0;
  v_has_locations := jsonb_typeof(coalesce(doc_access_scope, '{}'::jsonb)->'locations') = 'array'
    and jsonb_array_length(coalesce(doc_access_scope, '{}'::jsonb)->'locations') > 0;
  v_has_departments := jsonb_typeof(coalesce(doc_access_scope, '{}'::jsonb)->'department_ids') = 'array'
    and jsonb_array_length(coalesce(doc_access_scope, '{}'::jsonb)->'department_ids') > 0;
  v_has_positions := jsonb_typeof(coalesce(doc_access_scope, '{}'::jsonb)->'position_ids') = 'array'
    and jsonb_array_length(coalesce(doc_access_scope, '{}'::jsonb)->'position_ids') > 0;

  if not (v_has_users or v_has_locations or v_has_departments or v_has_positions) then
    return true;
  end if;

  if v_has_users and exists (
    select 1
    from jsonb_array_elements_text(coalesce(doc_access_scope->'users', '[]'::jsonb)) as scope_user(value)
    where scope_user.value = v_user_id::text
  ) then
    return true;
  end if;

  if v_has_locations then
    if v_effective_branch_id is null or not exists (
      select 1
      from jsonb_array_elements_text(coalesce(doc_access_scope->'locations', '[]'::jsonb)) as scope_branch(value)
      where scope_branch.value = v_effective_branch_id::text
    ) then
      return false;
    end if;
  end if;

  if v_has_departments then
    if v_employee_department_id is null or not exists (
      select 1
      from jsonb_array_elements_text(coalesce(doc_access_scope->'department_ids', '[]'::jsonb)) as scope_department(value)
      where scope_department.value = v_employee_department_id::text
    ) then
      return false;
    end if;
  end if;

  if v_has_positions then
    if coalesce(array_length(v_employee_position_ids, 1), 0) = 0 or not exists (
      select 1
      from jsonb_array_elements_text(coalesce(doc_access_scope->'position_ids', '[]'::jsonb)) as scope_position(value)
      where scope_position.value = any(v_employee_position_ids)
    ) then
      return false;
    end if;
  end if;

  return true;
end;
$$;

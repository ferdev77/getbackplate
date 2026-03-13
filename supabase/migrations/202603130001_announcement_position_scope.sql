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
    when (users_len + locations_len + departments_len + positions_len) = 0 then true
    else
      exists (
        select 1
        from jsonb_array_elements_text(coalesce(value->'users', '[]'::jsonb)) as scoped_user(item)
        where scoped_user.item = member_user_id::text
      )
      or (
        member_branch_id is not null
        and exists (
          select 1
          from jsonb_array_elements_text(coalesce(value->'locations', '[]'::jsonb)) as scoped_location(item)
          where scoped_location.item = member_branch_id::text
        )
      )
      or (
        employee_department_id is not null
        and exists (
          select 1
          from jsonb_array_elements_text(coalesce(value->'department_ids', '[]'::jsonb)) as scoped_department(item)
          where scoped_department.item = employee_department_id::text
        )
      )
      or (
        coalesce(array_length(employee_position_ids, 1), 0) > 0
        and exists (
          select 1
          from jsonb_array_elements_text(coalesce(value->'position_ids', '[]'::jsonb)) as scoped_position(item)
          where scoped_position.item = any(employee_position_ids)
        )
      )
  end
  from lengths;
$$;

create or replace function public.can_read_announcement(
  ann_org_id uuid,
  ann_id uuid,
  ann_branch_id uuid,
  ann_scope jsonb
)
returns boolean
language plpgsql
stable
as $$
declare
  v_user_id uuid := auth.uid();
  v_membership_branch_id uuid;
  v_employee_id uuid;
  v_employee_department_id uuid;
  v_employee_position text;
  v_employee_position_ids text[] := '{}'::text[];
  v_has_any_audience boolean := false;
  v_audience_match boolean := false;
begin
  if v_user_id is null then
    return false;
  end if;

  if public.is_superadmin() or public.can_manage_org(ann_org_id) then
    return true;
  end if;

  if not public.has_org_membership(ann_org_id) then
    return false;
  end if;

  select m.branch_id
    into v_membership_branch_id
  from public.memberships m
  where m.organization_id = ann_org_id
    and m.user_id = v_user_id
    and m.status = 'active'
  limit 1;

  select e.id, e.department_id, e.position
    into v_employee_id, v_employee_department_id, v_employee_position
  from public.employees e
  where e.organization_id = ann_org_id
    and e.user_id = v_user_id
  limit 1;

  if v_employee_id is not null and coalesce(nullif(trim(v_employee_position), ''), '') <> '' then
    select coalesce(array_agg(dp.id::text), '{}'::text[])
      into v_employee_position_ids
    from public.department_positions dp
    where dp.organization_id = ann_org_id
      and dp.is_active = true
      and lower(trim(dp.name)) = lower(trim(v_employee_position))
      and (
        v_employee_department_id is null
        or dp.department_id = v_employee_department_id
      );
  end if;

  if ann_branch_id is not null and (v_membership_branch_id is null or ann_branch_id <> v_membership_branch_id) then
    return false;
  end if;

  select exists (
      select 1
      from public.announcement_audiences aa
      where aa.organization_id = ann_org_id
        and aa.announcement_id = ann_id
    )
    into v_has_any_audience;

  if not v_has_any_audience then
    v_audience_match := true;
  else
    v_audience_match := exists (
      select 1
      from public.announcement_audiences aa
      where aa.organization_id = ann_org_id
        and aa.announcement_id = ann_id
        and (
          aa.user_id = v_user_id
          or (aa.user_id is null and aa.branch_id is null)
          or (
            aa.user_id is null
            and aa.branch_id is not null
            and v_membership_branch_id is not null
            and aa.branch_id = v_membership_branch_id
          )
        )
    );
  end if;

  if not v_audience_match then
    return false;
  end if;

  return public.announcement_scope_match(
    ann_scope,
    v_user_id,
    v_membership_branch_id,
    v_employee_department_id,
    v_employee_position_ids
  );
end;
$$;

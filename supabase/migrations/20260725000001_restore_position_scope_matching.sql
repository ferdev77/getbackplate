-- Restore position-based scope matching for announcements and checklist templates.
--
-- 20260501000001_fix_multilocacion_rls.sql (multi-location fix) rewrote
-- announcement_scope_match, can_read_announcement, checklist_scope_match, and
-- can_read_checklist_template from scratch to support member_branch_ids arrays,
-- but dropped the employee_position_ids parameter and all position matching
-- logic that 202603130001_announcement_position_scope.sql had introduced.
--
-- Effect: any announcement/checklist scoped by position_ids (with or without
-- locations/department_ids) silently stopped filtering by position — when
-- combined with locations, the position restriction was ignored entirely
-- (visible to everyone at those locations); when position_ids was the only
-- criterion, positions_len wasn't counted, so the scope was treated as empty
-- and the content became visible to the whole organization.
--
-- This migration re-adds employee_position_ids uuid[] to both *_scope_match
-- functions (position resolved the same way as the original implementation:
-- employees.position is free text, matched by name against
-- department_positions scoped to the employee's department), while keeping
-- the multi-location array support introduced in May intact.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ANNOUNCEMENT SCOPE MATCH — add employee_position_ids
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.announcement_scope_match(jsonb, uuid, uuid[], uuid);

create or replace function public.announcement_scope_match(
  scope jsonb,
  member_user_id uuid,
  member_branch_ids uuid[],
  employee_department_id uuid,
  employee_position_ids uuid[] default '{}'::uuid[]
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
        array_length(member_branch_ids, 1) > 0
        and exists (
          select 1
          from jsonb_array_elements_text(coalesce(value->'locations', '[]'::jsonb)) as scoped_location(item)
          cross join unnest(member_branch_ids) as allowed_id
          where scoped_location.item = allowed_id::text
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
        array_length(employee_position_ids, 1) > 0
        and exists (
          select 1
          from jsonb_array_elements_text(coalesce(value->'position_ids', '[]'::jsonb)) as scoped_position(item)
          cross join unnest(employee_position_ids) as allowed_position
          where scoped_position.item = allowed_position::text
        )
      )
  end
  from lengths;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CAN READ ANNOUNCEMENT — resolve employee_position_ids and pass through
-- ─────────────────────────────────────────────────────────────────────────────

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
  v_user_id            uuid    := auth.uid();
  v_all_branch_ids     uuid[]  := '{}';
  v_has_all_locations  boolean := false;
  v_employee_department_id uuid;
  v_employee_position  text;
  v_employee_position_ids uuid[] := '{}';
  v_has_any_audience   boolean := false;
  v_audience_match     boolean := false;
  v_emp_has_all        boolean;
  v_emp_branch_id      uuid;
  v_emp_scope_ids      uuid[];
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

  -- Collect all branch IDs from active memberships (branch_id + location_scope_ids).
  select
    coalesce(bool_or(coalesce(m.all_locations, false)), false),
    coalesce(
      array_agg(distinct expanded.bid) filter (where expanded.bid is not null),
      '{}'
    )
  into v_has_all_locations, v_all_branch_ids
  from public.memberships m
  cross join lateral (
    select m.branch_id as bid
    union all
    select unnest(coalesce(m.location_scope_ids, '{}')) as bid
  ) as expanded(bid)
  where m.organization_id = ann_org_id
    and m.user_id = v_user_id
    and m.status = 'active';

  -- Also include scope from the employee row.
  select e.all_locations, e.branch_id, e.location_scope_ids, e.department_id, e.position
    into v_emp_has_all, v_emp_branch_id, v_emp_scope_ids, v_employee_department_id, v_employee_position
  from public.employees e
  where e.organization_id = ann_org_id
    and e.user_id = v_user_id
  limit 1;

  if coalesce(v_emp_has_all, false) then
    v_has_all_locations := true;
  end if;

  if v_emp_branch_id is not null then
    v_all_branch_ids := v_all_branch_ids || array[v_emp_branch_id];
  end if;

  if v_emp_scope_ids is not null then
    v_all_branch_ids := v_all_branch_ids || v_emp_scope_ids;
  end if;

  -- When all_locations, expand to every active branch in the org.
  if v_has_all_locations then
    select coalesce(array_agg(b.id), '{}')
      into v_all_branch_ids
    from public.branches b
    where b.organization_id = ann_org_id
      and b.is_active = true;
  end if;

  -- Resolve the employee's position(s) by name within their department.
  if coalesce(nullif(trim(v_employee_position), ''), '') <> '' then
    select coalesce(array_agg(dp.id), '{}')
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

  -- Branch-level filter: announcement pinned to a specific branch.
  if ann_branch_id is not null then
    if not (v_has_all_locations or ann_branch_id = any(v_all_branch_ids)) then
      return false;
    end if;
  end if;

  -- Audience check.
  select exists (
    select 1
    from public.announcement_audiences aa
    where aa.organization_id = ann_org_id
      and aa.announcement_id = ann_id
  ) into v_has_any_audience;

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
            and aa.branch_id = any(v_all_branch_ids)
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
    v_all_branch_ids,
    v_employee_department_id,
    v_employee_position_ids
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CHECKLIST SCOPE MATCH — add employee_position_ids
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.checklist_scope_match(jsonb, uuid, uuid[], uuid);

create or replace function public.checklist_scope_match(
  scope jsonb,
  member_user_id uuid,
  member_branch_ids uuid[],
  employee_department_id uuid,
  employee_position_ids uuid[] default '{}'::uuid[]
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
        array_length(member_branch_ids, 1) > 0
        and exists (
          select 1
          from jsonb_array_elements_text(coalesce(value->'locations', '[]'::jsonb)) as scoped_location(item)
          cross join unnest(member_branch_ids) as allowed_id
          where scoped_location.item = allowed_id::text
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
        array_length(employee_position_ids, 1) > 0
        and exists (
          select 1
          from jsonb_array_elements_text(coalesce(value->'position_ids', '[]'::jsonb)) as scoped_position(item)
          cross join unnest(employee_position_ids) as allowed_position
          where scoped_position.item = allowed_position::text
        )
      )
  end
  from lengths;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CAN READ CHECKLIST TEMPLATE — resolve employee_position_ids and pass through
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.can_read_checklist_template(
  template_org_id uuid,
  template_branch_id uuid,
  template_department_id uuid,
  template_scope jsonb
)
returns boolean
language plpgsql
stable
as $$
declare
  v_user_id            uuid    := auth.uid();
  v_all_branch_ids     uuid[]  := '{}';
  v_has_all_locations  boolean := false;
  v_employee_department_id uuid;
  v_employee_position  text;
  v_employee_position_ids uuid[] := '{}';
  v_emp_has_all        boolean;
  v_emp_branch_id      uuid;
  v_emp_scope_ids      uuid[];
begin
  if v_user_id is null then
    return false;
  end if;

  if public.is_superadmin() or public.can_manage_org(template_org_id) then
    return true;
  end if;

  if not public.has_org_membership(template_org_id) then
    return false;
  end if;

  select
    coalesce(bool_or(coalesce(m.all_locations, false)), false),
    coalesce(
      array_agg(distinct expanded.bid) filter (where expanded.bid is not null),
      '{}'
    )
  into v_has_all_locations, v_all_branch_ids
  from public.memberships m
  cross join lateral (
    select m.branch_id as bid
    union all
    select unnest(coalesce(m.location_scope_ids, '{}')) as bid
  ) as expanded(bid)
  where m.organization_id = template_org_id
    and m.user_id = v_user_id
    and m.status = 'active';

  select e.all_locations, e.branch_id, e.location_scope_ids, e.department_id, e.position
    into v_emp_has_all, v_emp_branch_id, v_emp_scope_ids, v_employee_department_id, v_employee_position
  from public.employees e
  where e.organization_id = template_org_id
    and e.user_id = v_user_id
  limit 1;

  if coalesce(v_emp_has_all, false) then
    v_has_all_locations := true;
  end if;

  if v_emp_branch_id is not null then
    v_all_branch_ids := v_all_branch_ids || array[v_emp_branch_id];
  end if;

  if v_emp_scope_ids is not null then
    v_all_branch_ids := v_all_branch_ids || v_emp_scope_ids;
  end if;

  if v_has_all_locations then
    select coalesce(array_agg(b.id), '{}')
      into v_all_branch_ids
    from public.branches b
    where b.organization_id = template_org_id
      and b.is_active = true;
  end if;

  if coalesce(nullif(trim(v_employee_position), ''), '') <> '' then
    select coalesce(array_agg(dp.id), '{}')
      into v_employee_position_ids
    from public.department_positions dp
    where dp.organization_id = template_org_id
      and dp.is_active = true
      and lower(trim(dp.name)) = lower(trim(v_employee_position))
      and (
        v_employee_department_id is null
        or dp.department_id = v_employee_department_id
      );
  end if;

  if template_branch_id is not null then
    if not (v_has_all_locations or template_branch_id = any(v_all_branch_ids)) then
      return false;
    end if;
  end if;

  if template_department_id is not null and (v_employee_department_id is null or template_department_id <> v_employee_department_id) then
    return false;
  end if;

  return public.checklist_scope_match(
    template_scope,
    v_user_id,
    v_all_branch_ids,
    v_employee_department_id,
    v_employee_position_ids
  );
end;
$$;

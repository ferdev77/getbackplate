-- Fix RLS functions to support multi-location employees (location_scope_ids + all_locations).
-- Previously, can_read_announcement, can_read_checklist_template, and can_read_document
-- only checked the single membership.branch_id. Employees with location_scope_ids or
-- all_locations=true were incorrectly denied access to scoped content.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ANNOUNCEMENT SCOPE MATCH
--    Change signature: member_branch_id uuid → member_branch_ids uuid[]
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.announcement_scope_match(jsonb, uuid, uuid, uuid);

create or replace function public.announcement_scope_match(
  scope jsonb,
  member_user_id uuid,
  member_branch_ids uuid[],
  employee_department_id uuid
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
      value
    from prepared
  )
  select case
    when (users_len + locations_len + departments_len) = 0 then true
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
  end
  from lengths;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CAN READ ANNOUNCEMENT
--    Builds combined branch IDs from memberships + employee rows (including
--    location_scope_ids and all_locations). Expands to all org branches when
--    all_locations = true.
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
  select e.all_locations, e.branch_id, e.location_scope_ids, e.department_id
    into v_emp_has_all, v_emp_branch_id, v_emp_scope_ids, v_employee_department_id
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
    v_employee_department_id
  );
end;
$$;

-- Update announcement_audiences RLS to also recognise location_scope_ids and all_locations.
drop policy if exists announcement_audiences_tenant_select on public.announcement_audiences;

create policy announcement_audiences_tenant_select
  on public.announcement_audiences for select
  using (
    public.can_manage_org(organization_id)
    or user_id = auth.uid()
    or (
      user_id is null
      and branch_id is null
      and public.has_org_membership(organization_id)
    )
    or (
      user_id is null
      and branch_id is not null
      and (
        exists (
          select 1
          from public.memberships m
          where m.organization_id = announcement_audiences.organization_id
            and m.user_id = auth.uid()
            and m.status = 'active'
            and (
              coalesce(m.all_locations, false)
              or m.branch_id = announcement_audiences.branch_id
              or m.location_scope_ids @> array[announcement_audiences.branch_id]
            )
        )
        or exists (
          select 1
          from public.employees e
          where e.organization_id = announcement_audiences.organization_id
            and e.user_id = auth.uid()
            and (
              coalesce(e.all_locations, false)
              or e.branch_id = announcement_audiences.branch_id
              or e.location_scope_ids @> array[announcement_audiences.branch_id]
            )
        )
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CHECKLIST SCOPE MATCH
--    Change signature: member_branch_id uuid → member_branch_ids uuid[]
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.checklist_scope_match(jsonb, uuid, uuid, uuid);

create or replace function public.checklist_scope_match(
  scope jsonb,
  member_user_id uuid,
  member_branch_ids uuid[],
  employee_department_id uuid
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
      value
    from prepared
  )
  select case
    when (users_len + locations_len + departments_len) = 0 then true
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
  end
  from lengths;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CAN READ CHECKLIST TEMPLATE
--    Same multi-location branch expansion as can_read_announcement.
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

  select e.all_locations, e.branch_id, e.location_scope_ids, e.department_id
    into v_emp_has_all, v_emp_branch_id, v_emp_scope_ids, v_employee_department_id
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
    v_employee_department_id
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. CAN READ DOCUMENT
--    Same multi-location branch expansion. Checks all branch IDs against
--    doc's access_scope.locations and doc_branch_id.
-- ─────────────────────────────────────────────────────────────────────────────

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
  v_user_id            uuid    := auth.uid();
  v_role_code          text;
  v_all_branch_ids     uuid[]  := '{}';
  v_has_all_locations  boolean := false;
  v_employee_id        uuid;
  v_employee_department_id uuid;
  v_user_match         boolean := false;
  v_branch_match       boolean := false;
  v_department_match   boolean := false;
  v_has_scope          boolean := false;
  v_emp_has_all        boolean;
  v_emp_branch_id      uuid;
  v_emp_scope_ids      uuid[];
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

  select r.code
    into v_role_code
  from public.memberships m
  join public.roles r on r.id = m.role_id
  where m.organization_id = doc_org_id
    and m.user_id = v_user_id
    and m.status = 'active'
  limit 1;

  if v_role_code in ('company_admin') then
    return true;
  end if;

  -- Build combined branch IDs from memberships.
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
  where m.organization_id = doc_org_id
    and m.user_id = v_user_id
    and m.status = 'active';

  -- Include employee scope.
  select e.id, e.all_locations, e.branch_id, e.location_scope_ids, e.department_id
    into v_employee_id, v_emp_has_all, v_emp_branch_id, v_emp_scope_ids, v_employee_department_id
  from public.employees e
  where e.organization_id = doc_org_id
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
    where b.organization_id = doc_org_id
      and b.is_active = true;
  end if;

  -- Direct employee-document assignment bypasses scope.
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

  v_has_scope :=
    (jsonb_typeof(coalesce(doc_access_scope, '{}'::jsonb)->'users') = 'array'
      and jsonb_array_length(coalesce(doc_access_scope, '{}'::jsonb)->'users') > 0)
    or (jsonb_typeof(coalesce(doc_access_scope, '{}'::jsonb)->'locations') = 'array'
      and jsonb_array_length(coalesce(doc_access_scope, '{}'::jsonb)->'locations') > 0)
    or (jsonb_typeof(coalesce(doc_access_scope, '{}'::jsonb)->'department_ids') = 'array'
      and jsonb_array_length(coalesce(doc_access_scope, '{}'::jsonb)->'department_ids') > 0);

  if not v_has_scope then
    return true;
  end if;

  -- User match.
  if exists (
    select 1
    from jsonb_array_elements_text(coalesce(doc_access_scope->'users', '[]'::jsonb)) as scope_user(value)
    where scope_user.value = v_user_id::text
  ) then
    v_user_match := true;
  end if;

  -- Branch match: any of the user's branch IDs against scope locations.
  if array_length(v_all_branch_ids, 1) > 0 and exists (
    select 1
    from jsonb_array_elements_text(coalesce(doc_access_scope->'locations', '[]'::jsonb)) as scope_branch(value)
    cross join unnest(v_all_branch_ids) as allowed_id
    where scope_branch.value = allowed_id::text
  ) then
    v_branch_match := true;
  end if;

  -- doc_branch_id itself also grants access when the user is assigned to it.
  if doc_branch_id is not null and doc_branch_id = any(v_all_branch_ids) then
    v_branch_match := true;
  end if;

  -- Department match.
  if v_employee_department_id is not null and exists (
    select 1
    from jsonb_array_elements_text(coalesce(doc_access_scope->'department_ids', '[]'::jsonb)) as scope_department(value)
    where scope_department.value = v_employee_department_id::text
  ) then
    v_department_match := true;
  end if;

  return v_user_match or v_branch_match or v_department_match;
end;
$$;

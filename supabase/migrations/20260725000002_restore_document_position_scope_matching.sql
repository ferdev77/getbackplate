-- Restore position-based scope matching for documents.
--
-- Same regression as 20260725000001 (announcements/checklists): the multi-
-- location rewrite in 20260501000001_fix_multilocacion_rls.sql dropped the
-- position_ids matching that 202603120005_document_position_scope.sql had
-- introduced for can_read_document. position_ids stopped counting towards
-- the "is scope empty" check and stopped being matched at all.
--
-- Real-world impact check (2026-07-25): the 4 documents in production using
-- position_ids also had locations/department_ids set, and this scope model
-- is a union (OR) — visible if ANY criterion matches. Those documents were
-- already broadly visible via locations/departments regardless of the
-- position bug, so no document was actually over-exposed by this specific
-- gap today. Still restoring it so "position-only" scoping (no location/
-- department/user set) works as intended instead of silently defaulting to
-- "visible to the whole organization".

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
  v_employee_position  text;
  v_employee_position_ids uuid[] := '{}';
  v_user_match         boolean := false;
  v_branch_match       boolean := false;
  v_department_match   boolean := false;
  v_position_match     boolean := false;
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
  select e.id, e.all_locations, e.branch_id, e.location_scope_ids, e.department_id, e.position
    into v_employee_id, v_emp_has_all, v_emp_branch_id, v_emp_scope_ids, v_employee_department_id, v_employee_position
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

  -- Resolve the employee's position(s) by name within their department.
  if coalesce(nullif(trim(v_employee_position), ''), '') <> '' then
    select coalesce(array_agg(dp.id), '{}')
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

  v_has_scope :=
    (jsonb_typeof(coalesce(doc_access_scope, '{}'::jsonb)->'users') = 'array'
      and jsonb_array_length(coalesce(doc_access_scope, '{}'::jsonb)->'users') > 0)
    or (jsonb_typeof(coalesce(doc_access_scope, '{}'::jsonb)->'locations') = 'array'
      and jsonb_array_length(coalesce(doc_access_scope, '{}'::jsonb)->'locations') > 0)
    or (jsonb_typeof(coalesce(doc_access_scope, '{}'::jsonb)->'department_ids') = 'array'
      and jsonb_array_length(coalesce(doc_access_scope, '{}'::jsonb)->'department_ids') > 0)
    or (jsonb_typeof(coalesce(doc_access_scope, '{}'::jsonb)->'position_ids') = 'array'
      and jsonb_array_length(coalesce(doc_access_scope, '{}'::jsonb)->'position_ids') > 0);

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

  -- Position match.
  if array_length(v_employee_position_ids, 1) > 0 and exists (
    select 1
    from jsonb_array_elements_text(coalesce(doc_access_scope->'position_ids', '[]'::jsonb)) as scope_position(value)
    cross join unnest(v_employee_position_ids) as allowed_position
    where scope_position.value = allowed_position::text
  ) then
    v_position_match := true;
  end if;

  return v_user_match or v_branch_match or v_department_match or v_position_match;
end;
$$;

-- Folder scope inheritance + harden document_folders RLS.
--
-- Two real gaps found while designing the "premium" inheritance UX
-- (2026-07-26):
--
-- 1. document_folders_tenant_select was NEVER hardened past the original
--    base migration (20260311000100_base_saas.sql) — it only checked
--    has_org_membership(organization_id), meaning ANY member of the org
--    could read ANY folder's name/access_scope/parent_id directly via
--    Supabase (bypassing the branch/department/position scope entirely).
--    documents itself got hardened in 202603120001_harden_document_rls.sql,
--    but the equivalent pass was never done for document_folders.
--
-- 2. Documents already "inherit" the scope of their immediate containing
--    folder when they have no explicit scope of their own (see
--    resolveDocumentEffectiveScope in the app), but folders never inherited
--    from THEIR parent folder — an empty-scope folder nested inside a
--    scoped folder was treated as fully open instead of following its
--    parent's rule. This migration makes the inheritance recursive (walk
--    up the parent chain until a folder with an explicit scope is found,
--    or the root is reached) and enforces it at the RLS layer for both
--    document_folders and documents, not just in application code.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Recursive resolver: walks up parent_id until it finds a folder with an
--    explicit scope (locations/department_ids/position_ids/users non-empty),
--    or reaches the root with none (fully open).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.resolve_folder_effective_scope(
  p_org_id uuid,
  p_folder_id uuid
)
returns table (scope jsonb, source_folder_id uuid)
language sql
stable
as $$
  with recursive chain as (
    select f.id, f.parent_id, f.access_scope, 0 as depth
    from public.document_folders f
    where f.organization_id = p_org_id and f.id = p_folder_id
    union all
    select f.id, f.parent_id, f.access_scope, c.depth + 1
    from public.document_folders f
    join chain c on f.id = c.parent_id
    where f.organization_id = p_org_id and c.depth < 50
  ),
  scoped as (
    select c.id, c.access_scope, c.depth
    from chain c
    where (
      jsonb_typeof(coalesce(c.access_scope, '{}'::jsonb)->'users') = 'array'
        and jsonb_array_length(coalesce(c.access_scope, '{}'::jsonb)->'users') > 0
      or jsonb_typeof(coalesce(c.access_scope, '{}'::jsonb)->'locations') = 'array'
        and jsonb_array_length(coalesce(c.access_scope, '{}'::jsonb)->'locations') > 0
      or jsonb_typeof(coalesce(c.access_scope, '{}'::jsonb)->'department_ids') = 'array'
        and jsonb_array_length(coalesce(c.access_scope, '{}'::jsonb)->'department_ids') > 0
      or jsonb_typeof(coalesce(c.access_scope, '{}'::jsonb)->'position_ids') = 'array'
        and jsonb_array_length(coalesce(c.access_scope, '{}'::jsonb)->'position_ids') > 0
    )
    order by c.depth asc
    limit 1
  )
  select coalesce((select access_scope from scoped), '{}'::jsonb), (select id from scoped);
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CAN READ DOCUMENT FOLDER — new function, replaces the loose
--    has_org_membership() check with real scope matching (same shape as
--    can_read_document: superadmin/admin bypass, multi-location branch
--    combination from memberships+employees, department, position),
--    using the recursively-resolved effective scope.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.can_read_document_folder(
  folder_org_id uuid,
  folder_id uuid
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
  v_employee_department_id uuid;
  v_employee_position  text;
  v_employee_position_ids uuid[] := '{}';
  v_emp_has_all        boolean;
  v_emp_branch_id      uuid;
  v_emp_scope_ids      uuid[];
  v_effective_scope    jsonb;
  v_has_scope          boolean := false;
  v_user_match         boolean := false;
  v_branch_match       boolean := false;
  v_department_match   boolean := false;
  v_position_match     boolean := false;
begin
  if v_user_id is null then
    return false;
  end if;

  if public.is_superadmin() or public.can_manage_org(folder_org_id) then
    return true;
  end if;

  if not public.has_org_membership(folder_org_id) then
    return false;
  end if;

  select r.code
    into v_role_code
  from public.memberships m
  join public.roles r on r.id = m.role_id
  where m.organization_id = folder_org_id
    and m.user_id = v_user_id
    and m.status = 'active'
  limit 1;

  if v_role_code in ('company_admin') then
    return true;
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
  where m.organization_id = folder_org_id
    and m.user_id = v_user_id
    and m.status = 'active';

  select e.all_locations, e.branch_id, e.location_scope_ids, e.department_id, e.position
    into v_emp_has_all, v_emp_branch_id, v_emp_scope_ids, v_employee_department_id, v_employee_position
  from public.employees e
  where e.organization_id = folder_org_id
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
    where b.organization_id = folder_org_id
      and b.is_active = true;
  end if;

  if coalesce(nullif(trim(v_employee_position), ''), '') <> '' then
    select coalesce(array_agg(dp.id), '{}')
      into v_employee_position_ids
    from public.department_positions dp
    where dp.organization_id = folder_org_id
      and dp.is_active = true
      and lower(trim(dp.name)) = lower(trim(v_employee_position))
      and (
        v_employee_department_id is null
        or dp.department_id = v_employee_department_id
      );
  end if;

  select resolved.scope
    into v_effective_scope
  from public.resolve_folder_effective_scope(folder_org_id, folder_id) as resolved;

  v_has_scope :=
    (jsonb_typeof(coalesce(v_effective_scope, '{}'::jsonb)->'users') = 'array'
      and jsonb_array_length(coalesce(v_effective_scope, '{}'::jsonb)->'users') > 0)
    or (jsonb_typeof(coalesce(v_effective_scope, '{}'::jsonb)->'locations') = 'array'
      and jsonb_array_length(coalesce(v_effective_scope, '{}'::jsonb)->'locations') > 0)
    or (jsonb_typeof(coalesce(v_effective_scope, '{}'::jsonb)->'department_ids') = 'array'
      and jsonb_array_length(coalesce(v_effective_scope, '{}'::jsonb)->'department_ids') > 0)
    or (jsonb_typeof(coalesce(v_effective_scope, '{}'::jsonb)->'position_ids') = 'array'
      and jsonb_array_length(coalesce(v_effective_scope, '{}'::jsonb)->'position_ids') > 0);

  if not v_has_scope then
    return true;
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(coalesce(v_effective_scope->'users', '[]'::jsonb)) as scope_user(value)
    where scope_user.value = v_user_id::text
  ) then
    v_user_match := true;
  end if;

  if array_length(v_all_branch_ids, 1) > 0 and exists (
    select 1
    from jsonb_array_elements_text(coalesce(v_effective_scope->'locations', '[]'::jsonb)) as scope_branch(value)
    cross join unnest(v_all_branch_ids) as allowed_id
    where scope_branch.value = allowed_id::text
  ) then
    v_branch_match := true;
  end if;

  if v_employee_department_id is not null and exists (
    select 1
    from jsonb_array_elements_text(coalesce(v_effective_scope->'department_ids', '[]'::jsonb)) as scope_department(value)
    where scope_department.value = v_employee_department_id::text
  ) then
    v_department_match := true;
  end if;

  if array_length(v_employee_position_ids, 1) > 0 and exists (
    select 1
    from jsonb_array_elements_text(coalesce(v_effective_scope->'position_ids', '[]'::jsonb)) as scope_position(value)
    cross join unnest(v_employee_position_ids) as allowed_position
    where scope_position.value = allowed_position::text
  ) then
    v_position_match := true;
  end if;

  return v_user_match or v_branch_match or v_department_match or v_position_match;
end;
$$;

drop policy if exists document_folders_tenant_select on public.document_folders;

create policy document_folders_tenant_select
  on public.document_folders for select
  using (public.can_read_document_folder(organization_id, id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CAN READ DOCUMENT — add doc_folder_id so a document with no explicit
--    scope of its own falls back to the RECURSIVELY-resolved effective
--    scope of its folder (previously it just returned true immediately,
--    ignoring the folder entirely).
-- ─────────────────────────────────────────────────────────────────────────────

-- Must drop the policy before the function it depends on can be dropped/
-- replaced with a different signature.
drop policy if exists documents_tenant_select on public.documents;
drop function if exists public.can_read_document(uuid, uuid, jsonb, uuid);

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
  v_effective_scope     jsonb;
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

  -- Effective scope: the document's own explicit scope wins; if it has
  -- none, fall back to the recursively-resolved scope of its folder.
  v_effective_scope := coalesce(doc_access_scope, '{}'::jsonb);
  v_has_scope :=
    (jsonb_typeof(v_effective_scope->'users') = 'array' and jsonb_array_length(v_effective_scope->'users') > 0)
    or (jsonb_typeof(v_effective_scope->'locations') = 'array' and jsonb_array_length(v_effective_scope->'locations') > 0)
    or (jsonb_typeof(v_effective_scope->'department_ids') = 'array' and jsonb_array_length(v_effective_scope->'department_ids') > 0)
    or (jsonb_typeof(v_effective_scope->'position_ids') = 'array' and jsonb_array_length(v_effective_scope->'position_ids') > 0);

  if not v_has_scope and doc_folder_id is not null then
    select resolved.scope
      into v_effective_scope
    from public.resolve_folder_effective_scope(doc_org_id, doc_folder_id) as resolved;

    v_has_scope :=
      (jsonb_typeof(coalesce(v_effective_scope, '{}'::jsonb)->'users') = 'array'
        and jsonb_array_length(coalesce(v_effective_scope, '{}'::jsonb)->'users') > 0)
      or (jsonb_typeof(coalesce(v_effective_scope, '{}'::jsonb)->'locations') = 'array'
        and jsonb_array_length(coalesce(v_effective_scope, '{}'::jsonb)->'locations') > 0)
      or (jsonb_typeof(coalesce(v_effective_scope, '{}'::jsonb)->'department_ids') = 'array'
        and jsonb_array_length(coalesce(v_effective_scope, '{}'::jsonb)->'department_ids') > 0)
      or (jsonb_typeof(coalesce(v_effective_scope, '{}'::jsonb)->'position_ids') = 'array'
        and jsonb_array_length(coalesce(v_effective_scope, '{}'::jsonb)->'position_ids') > 0);
  end if;

  if not v_has_scope then
    return true;
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(coalesce(v_effective_scope->'users', '[]'::jsonb)) as scope_user(value)
    where scope_user.value = v_user_id::text
  ) then
    v_user_match := true;
  end if;

  if array_length(v_all_branch_ids, 1) > 0 and exists (
    select 1
    from jsonb_array_elements_text(coalesce(v_effective_scope->'locations', '[]'::jsonb)) as scope_branch(value)
    cross join unnest(v_all_branch_ids) as allowed_id
    where scope_branch.value = allowed_id::text
  ) then
    v_branch_match := true;
  end if;

  if doc_branch_id is not null and doc_branch_id = any(v_all_branch_ids) then
    v_branch_match := true;
  end if;

  if v_employee_department_id is not null and exists (
    select 1
    from jsonb_array_elements_text(coalesce(v_effective_scope->'department_ids', '[]'::jsonb)) as scope_department(value)
    where scope_department.value = v_employee_department_id::text
  ) then
    v_department_match := true;
  end if;

  if array_length(v_employee_position_ids, 1) > 0 and exists (
    select 1
    from jsonb_array_elements_text(coalesce(v_effective_scope->'position_ids', '[]'::jsonb)) as scope_position(value)
    cross join unnest(v_employee_position_ids) as allowed_position
    where scope_position.value = allowed_position::text
  ) then
    v_position_match := true;
  end if;

  return v_user_match or v_branch_match or v_department_match or v_position_match;
end;
$$;

drop policy if exists documents_tenant_select on public.documents;

create policy documents_tenant_select
  on public.documents for select
  using (public.can_read_document(organization_id, branch_id, access_scope, id, folder_id));

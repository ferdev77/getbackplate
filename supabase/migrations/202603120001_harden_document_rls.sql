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
  v_employee_department_id uuid;
  v_user_match boolean := false;
  v_branch_match boolean := false;
  v_department_match boolean := false;
  v_has_scope boolean := false;
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

  select e.id, e.department_id
    into v_employee_id, v_employee_department_id
  from public.employees e
  where e.organization_id = doc_org_id
    and e.user_id = v_user_id
  limit 1;

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
    jsonb_typeof(coalesce(doc_access_scope, '{}'::jsonb)->'users') = 'array'
    and jsonb_array_length(coalesce(doc_access_scope, '{}'::jsonb)->'users') > 0
    or jsonb_typeof(coalesce(doc_access_scope, '{}'::jsonb)->'locations') = 'array'
    and jsonb_array_length(coalesce(doc_access_scope, '{}'::jsonb)->'locations') > 0
    or jsonb_typeof(coalesce(doc_access_scope, '{}'::jsonb)->'department_ids') = 'array'
    and jsonb_array_length(coalesce(doc_access_scope, '{}'::jsonb)->'department_ids') > 0;

  if not v_has_scope then
    return true;
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(coalesce(doc_access_scope->'users', '[]'::jsonb)) as scope_user(value)
    where scope_user.value = v_user_id::text
  ) then
    v_user_match := true;
  end if;

  if v_membership_branch_id is not null and exists (
    select 1
    from jsonb_array_elements_text(coalesce(doc_access_scope->'locations', '[]'::jsonb)) as scope_branch(value)
    where scope_branch.value = v_membership_branch_id::text
  ) then
    v_branch_match := true;
  end if;

  if v_employee_department_id is not null and exists (
    select 1
    from jsonb_array_elements_text(coalesce(doc_access_scope->'department_ids', '[]'::jsonb)) as scope_department(value)
    where scope_department.value = v_employee_department_id::text
  ) then
    v_department_match := true;
  end if;

  if doc_branch_id is not null and v_membership_branch_id is not null and doc_branch_id = v_membership_branch_id then
    v_branch_match := true;
  end if;

  return v_user_match or v_branch_match or v_department_match;
end;
$$;

drop policy if exists documents_tenant_select on public.documents;

create policy documents_tenant_select
  on public.documents for select
  using (public.can_read_document(organization_id, branch_id, access_scope, id));

drop policy if exists employee_documents_tenant_select on public.employee_documents;

create policy employee_documents_tenant_select
  on public.employee_documents for select
  using (
    public.is_superadmin()
    or public.can_manage_org(organization_id)
    or exists (
      select 1
      from public.employees e
      where e.organization_id = employee_documents.organization_id
        and e.id = employee_documents.employee_id
        and e.user_id = auth.uid()
    )
  );

create or replace function public.get_company_users(lookup_organization_id uuid)
returns table (
  id uuid,
  user_id uuid,
  role_id uuid,
  branch_id uuid,
  status text,
  created_at timestamptz,
  email text,
  full_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    membership.id,
    membership.user_id,
    membership.role_id,
    membership.branch_id,
    membership.status,
    membership.created_at,
    auth_user.email::text,
    (auth_user.raw_user_meta_data->>'full_name')::text
  from public.memberships membership
  join auth.users auth_user on auth_user.id = membership.user_id
  where membership.organization_id = lookup_organization_id
    and public.can_manage_org(lookup_organization_id)
    and not exists (
      select 1
      from public.employees employee
      where employee.organization_id = lookup_organization_id
        and employee.user_id = membership.user_id
    )
  order by membership.created_at desc;
$$;

revoke all on function public.get_company_users(uuid) from public, anon;
grant execute on function public.get_company_users(uuid) to authenticated, service_role;

create or replace function public.get_employee_access_context(
  p_user_id uuid,
  p_organization_id uuid
)
returns table (
  has_membership boolean,
  role_code text,
  branch_id uuid,
  membership_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    membership.id is not null,
    coalesce(role.code, ''),
    membership.branch_id,
    membership.id
  from public.organizations organization
  left join public.memberships membership
    on membership.organization_id = organization.id
   and membership.user_id = p_user_id
   and membership.status = 'active'
  left join public.roles role on role.id = membership.role_id
  where organization.id = p_organization_id
    and (p_user_id = auth.uid() or public.is_superadmin())
  limit 1;
$$;

revoke all on function public.get_employee_access_context(uuid, uuid) from public, anon;
grant execute on function public.get_employee_access_context(uuid, uuid) to authenticated, service_role;

create or replace function public.get_tenant_access_context(
  p_user_id uuid,
  p_organization_id uuid,
  p_module_code text
)
returns table (
  has_membership boolean,
  role_code text,
  branch_id uuid,
  membership_id uuid,
  billing_onboarding_required boolean,
  subscription_status text,
  subscription_period_end timestamptz,
  module_enabled boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    membership.id is not null,
    coalesce(role.code, ''),
    membership.branch_id,
    membership.id,
    coalesce(organization.billing_onboarding_required, false),
    subscription.status,
    subscription.current_period_end,
    coalesce(organization_module.is_enabled, false)
  from public.organizations organization
  left join public.memberships membership
    on membership.organization_id = organization.id
   and membership.user_id = p_user_id
   and membership.status = 'active'
  left join public.roles role on role.id = membership.role_id
  left join lateral (
    select candidate.status, candidate.current_period_end
    from public.subscriptions candidate
    where candidate.organization_id = p_organization_id
    order by candidate.current_period_end desc nulls last
    limit 1
  ) subscription on true
  left join public.module_catalog module on module.code = p_module_code
  left join public.organization_modules organization_module
    on organization_module.organization_id = p_organization_id
   and organization_module.module_id = module.id
  where organization.id = p_organization_id
    and (p_user_id = auth.uid() or public.is_superadmin())
  limit 1;
$$;

revoke all on function public.get_tenant_access_context(uuid, uuid, text) from public, anon;
grant execute on function public.get_tenant_access_context(uuid, uuid, text) to authenticated, service_role;

create or replace function public.count_accessible_documents(
  p_organization_id uuid,
  p_user_id uuid,
  p_role_code text,
  p_branch_id uuid default null,
  p_department_id uuid default null,
  p_position_ids uuid[] default '{}'
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if auth.uid() is null then
    return 0;
  end if;
  if p_user_id <> auth.uid() and not public.is_superadmin() then
    return 0;
  end if;
  if not public.has_org_membership(p_organization_id) and not public.is_superadmin() then
    return 0;
  end if;

  select count(*)::integer
  into v_count
  from public.documents document
  where document.organization_id = p_organization_id
    and public.can_read_document(
      document.organization_id,
      document.branch_id,
      document.access_scope,
      document.id,
      document.folder_id
    );

  return v_count;
end;
$$;

revoke all on function public.count_accessible_documents(uuid, uuid, text, uuid, uuid, uuid[]) from public, anon;
grant execute on function public.count_accessible_documents(uuid, uuid, text, uuid, uuid, uuid[]) to authenticated, service_role;

-- The API route validates the actor, tenant, template, and payload before using
-- its service-role client for this atomic write.
revoke all on function public.submit_checklist_transaction(
  uuid, uuid, uuid, uuid, uuid, jsonb, timestamp with time zone
) from public, anon, authenticated;
grant execute on function public.submit_checklist_transaction(
  uuid, uuid, uuid, uuid, uuid, jsonb, timestamp with time zone
) to service_role;

notify pgrst, 'reload schema';

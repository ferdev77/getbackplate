do $$
declare
  v_company_admin_role_id uuid;
  v_manager_role_id uuid;
begin
  select id into v_company_admin_role_id
  from public.roles
  where code = 'company_admin'
  limit 1;

  select id into v_manager_role_id
  from public.roles
  where code = 'manager'
  limit 1;

  if v_company_admin_role_id is not null and v_manager_role_id is not null then
    update public.memberships
    set role_id = v_company_admin_role_id,
        updated_at = timezone('utc', now())
    where role_id = v_manager_role_id;

    delete from public.role_permissions
    where role_id = v_manager_role_id;

    delete from public.roles
    where id = v_manager_role_id;
  end if;
end
$$;

create or replace function public.can_manage_org(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_superadmin()
    or public.has_org_role(org_id, 'company_admin');
$$;

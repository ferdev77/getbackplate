-- Reconcile environments that applied 20260726000003 before delegated HR scope
-- was included in the employee SELECT policy.
create or replace function public.can_read_employee_hr_record(
  p_organization_id uuid,
  p_employee_user_id uuid,
  p_employee_branch_id uuid,
  p_employee_location_scope_ids uuid[],
  p_employee_all_locations boolean
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_membership_id uuid;
  v_membership_branch_id uuid;
  v_membership_location_ids uuid[] := '{}';
  v_membership_all_locations boolean := false;
  v_employee_branch_id uuid;
  v_employee_location_ids uuid[] := '{}';
  v_employee_all_locations boolean := false;
  v_actor_location_ids uuid[] := '{}';
  v_target_location_ids uuid[] := '{}';
begin
  if v_user_id is null then
    return false;
  end if;
  if public.is_superadmin() or public.can_manage_org(p_organization_id) then
    return true;
  end if;
  if p_employee_user_id = v_user_id and public.has_org_membership(p_organization_id) then
    return true;
  end if;

  select membership.id, membership.branch_id, membership.location_scope_ids, membership.all_locations
  into v_membership_id, v_membership_branch_id, v_membership_location_ids, v_membership_all_locations
  from public.memberships membership
  join public.roles role on role.id = membership.role_id
  where membership.organization_id = p_organization_id
    and membership.user_id = v_user_id
    and membership.status = 'active'
    and role.code = 'employee'
  limit 1;

  if v_membership_id is null or not public.has_employee_module_capability(
    p_organization_id,
    v_membership_id,
    'employees',
    'view'
  ) then
    return false;
  end if;

  select employee.branch_id, employee.location_scope_ids, employee.all_locations
  into v_employee_branch_id, v_employee_location_ids, v_employee_all_locations
  from public.employees employee
  where employee.organization_id = p_organization_id
    and employee.user_id = v_user_id
  limit 1;

  if coalesce(v_membership_all_locations, false) or coalesce(v_employee_all_locations, false) then
    return true;
  end if;

  v_actor_location_ids := array_remove(array[
    v_membership_branch_id,
    v_employee_branch_id
  ], null) || coalesce(v_membership_location_ids, '{}') || coalesce(v_employee_location_ids, '{}');

  if coalesce(array_length(v_actor_location_ids, 1), 0) = 0 then
    return false;
  end if;
  if coalesce(p_employee_all_locations, false) then
    return true;
  end if;

  v_target_location_ids := array_remove(array[p_employee_branch_id], null)
    || coalesce(p_employee_location_scope_ids, '{}');

  return exists (
    select 1
    from unnest(v_actor_location_ids) actor_location(id)
    join unnest(v_target_location_ids) target_location(id)
      on target_location.id = actor_location.id
  );
end;
$$;

revoke all on function public.can_read_employee_hr_record(uuid, uuid, uuid, uuid[], boolean) from public, anon;
grant execute on function public.can_read_employee_hr_record(uuid, uuid, uuid, uuid[], boolean) to authenticated, service_role;

drop policy if exists employees_tenant_select on public.employees;
create policy employees_tenant_select
  on public.employees for select
  using (public.can_read_employee_hr_record(
    organization_id,
    user_id,
    branch_id,
    location_scope_ids,
    all_locations
  ));

drop policy if exists employee_contracts_tenant_select on public.employee_contracts;
create policy employee_contracts_tenant_select
  on public.employee_contracts for select
  using (
    public.is_superadmin()
    or public.can_manage_org(organization_id)
    or exists (
      select 1
      from public.employees employee
      where employee.id = employee_contracts.employee_id
        and employee.organization_id = employee_contracts.organization_id
        and public.can_read_employee_hr_record(
          employee.organization_id,
          employee.user_id,
          employee.branch_id,
          employee.location_scope_ids,
          employee.all_locations
        )
    )
  );

notify pgrst, 'reload schema';

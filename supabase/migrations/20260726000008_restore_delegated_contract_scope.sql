-- Reconcile environments that applied the original contract policy before
-- delegated HR location scope was restored.
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

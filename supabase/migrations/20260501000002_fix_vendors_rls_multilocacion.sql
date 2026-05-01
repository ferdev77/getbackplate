-- Fix vendors_employee_select RLS policy for multi-location employees.
--
-- Two bugs in the original policy (20260415000002_vendors_module.sql):
-- 1. Only checked membership.branch_id (singular) — multi-location employees
--    with location_scope_ids or all_locations=true could not see scoped vendors.
-- 2. Vendors with NO rows in vendor_locations (truly global) were invisible to
--    employees because neither EXISTS condition was satisfied.

drop policy if exists "vendors_employee_select" on public.vendors;

create policy "vendors_employee_select"
  on public.vendors
  for select
  to authenticated
  using (
    is_active = true
    -- Must be an active employee-role membership for this org.
    and exists (
      select 1
      from public.memberships m
      join public.roles r on r.id = m.role_id
      where m.organization_id = vendors.organization_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and r.code = 'employee'
    )
    and (
      -- 1. Truly global vendor: no rows in vendor_locations at all.
      not exists (
        select 1
        from public.vendor_locations vl
        where vl.vendor_id = vendors.id
      )
      or
      -- 2. Vendor has an explicit global entry (branch_id IS NULL).
      exists (
        select 1
        from public.vendor_locations vl
        where vl.vendor_id = vendors.id
          and vl.branch_id is null
      )
      or
      -- 3. Employee has all_locations access (membership or employee record).
      exists (
        select 1
        from public.memberships m
        where m.organization_id = vendors.organization_id
          and m.user_id = auth.uid()
          and m.status = 'active'
          and coalesce(m.all_locations, false)
      )
      or
      exists (
        select 1
        from public.employees e
        where e.organization_id = vendors.organization_id
          and e.user_id = auth.uid()
          and coalesce(e.all_locations, false)
      )
      or
      -- 4. Vendor is scoped to a branch the employee has access to
      --    (membership.branch_id, membership.location_scope_ids,
      --     employee.branch_id, employee.location_scope_ids).
      exists (
        select 1
        from public.vendor_locations vl
        where vl.vendor_id = vendors.id
          and vl.branch_id is not null
          and vl.branch_id in (
            select bid
            from (
              select m.branch_id as bid
              from public.memberships m
              where m.organization_id = vendors.organization_id
                and m.user_id = auth.uid()
                and m.status = 'active'
                and m.branch_id is not null
              union all
              select unnest(m.location_scope_ids) as bid
              from public.memberships m
              where m.organization_id = vendors.organization_id
                and m.user_id = auth.uid()
                and m.status = 'active'
                and m.location_scope_ids is not null
              union all
              select e.branch_id as bid
              from public.employees e
              where e.organization_id = vendors.organization_id
                and e.user_id = auth.uid()
                and e.branch_id is not null
              union all
              select unnest(e.location_scope_ids) as bid
              from public.employees e
              where e.organization_id = vendors.organization_id
                and e.user_id = auth.uid()
                and e.location_scope_ids is not null
            ) as allowed_branches(bid)
          )
      )
    )
  );

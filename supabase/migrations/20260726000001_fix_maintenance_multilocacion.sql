-- Fix can_access_maintenance_request to also honor multi-location settings
-- stored on memberships (all_locations, location_scope_ids), not just on
-- the employees row.
--
-- documents/announcements/checklists RLS already combine both membership-
-- level and employee-level location data (see 20260501000001_fix_
-- multilocacion_rls.sql). maintenance never got the same fix — it only
-- checked employees.all_locations/location_scope_ids and the singular
-- memberships.branch_id, missing memberships.all_locations and
-- memberships.location_scope_ids entirely.
--
-- No real-world impact found as of 2026-07-26 (memberships and employees
-- rows are in sync for every real multi-location employee in production
-- today), but fixing for consistency so it doesn't silently break if they
-- ever diverge.

create or replace function public.can_access_maintenance_request(
  p_organization_id uuid,
  p_branch_id uuid,
  p_created_by uuid
)
returns boolean
language sql
stable
as $$
  select public.is_superadmin()
    or public.can_manage_org(p_organization_id)
    or exists (
      select 1
      from public.memberships m
      join public.roles r on r.id = m.role_id
      left join public.employees e
        on e.organization_id = m.organization_id
       and e.user_id = m.user_id
       and e.status = 'active'
      where m.organization_id = p_organization_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and r.code = 'employee'
        and (
          p_created_by = auth.uid()
          or coalesce(m.all_locations, false)
          or coalesce(e.all_locations, false)
          or m.branch_id = p_branch_id
          or p_branch_id = any(coalesce(m.location_scope_ids, array[]::uuid[]))
          or p_branch_id = any(coalesce(e.location_scope_ids, array[]::uuid[]))
        )
    );
$$;

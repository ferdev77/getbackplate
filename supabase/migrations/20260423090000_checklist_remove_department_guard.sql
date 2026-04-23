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
  v_user_id uuid := auth.uid();
  v_membership_branch_id uuid;
  v_employee_branch_id uuid;
  v_effective_branch_id uuid;
  v_employee_department_id uuid;
  v_employee_position text;
  v_employee_position_ids text[] := '{}'::text[];
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

  select m.branch_id
    into v_membership_branch_id
  from public.memberships m
  where m.organization_id = template_org_id
    and m.user_id = v_user_id
    and m.status = 'active'
  limit 1;

  select e.branch_id, e.department_id, e.position
    into v_employee_branch_id, v_employee_department_id, v_employee_position
  from public.employees e
  where e.organization_id = template_org_id
    and e.user_id = v_user_id
  limit 1;

  v_effective_branch_id := coalesce(v_membership_branch_id, v_employee_branch_id);

  if v_employee_position is not null and btrim(v_employee_position) <> '' then
    select coalesce(array_agg(dp.id::text), '{}'::text[])
      into v_employee_position_ids
    from public.department_positions dp
    where dp.organization_id = template_org_id
      and dp.is_active = true
      and lower(dp.name) = lower(v_employee_position)
      and (
        v_employee_department_id is null
        or dp.department_id = v_employee_department_id
      );
  end if;

  if template_branch_id is not null and (v_effective_branch_id is null or template_branch_id <> v_effective_branch_id) then
    return false;
  end if;

  return public.checklist_scope_match(
    template_scope,
    v_user_id,
    v_effective_branch_id,
    v_employee_department_id,
    v_employee_position_ids
  );
end;
$$;

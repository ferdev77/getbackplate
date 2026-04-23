alter table public.employee_module_permissions
  add column if not exists can_view boolean not null default false;

alter table public.employee_module_permissions
  drop constraint if exists employee_module_permissions_module_ck;

alter table public.employee_module_permissions
  add constraint employee_module_permissions_module_ck
  check (module_code in ('announcements', 'checklists', 'documents', 'vendors', 'ai_assistant'));

update public.employee_module_permissions
set can_view = true
where module_code = 'vendors'
  and (can_create or can_edit or can_delete)
  and can_view = false;

create or replace function public.has_employee_module_capability(
  p_organization_id uuid,
  p_membership_id uuid,
  p_module_code text,
  p_capability text
)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.employee_module_permissions emp
    where emp.organization_id = p_organization_id
      and emp.membership_id = p_membership_id
      and emp.module_code = p_module_code
      and (
        (p_capability = 'view' and emp.can_view)
        or (p_capability = 'create' and emp.can_create)
        or (p_capability = 'edit' and emp.can_edit)
        or (p_capability = 'delete' and emp.can_delete)
      )
  );
$$;

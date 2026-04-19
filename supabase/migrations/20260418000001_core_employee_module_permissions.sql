-- Core module: permissions (delegation from company_admin to employee memberships)

insert into public.module_catalog (code, name, description, is_core)
values (
  'permissions',
  'Permisos',
  'Delegacion de capacidades create/edit/delete a empleados con acceso a dashboard',
  true
)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  is_core = true,
  updated_at = timezone('utc', now());

create table if not exists public.employee_module_permissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  membership_id uuid not null references public.memberships(id) on delete cascade,
  module_code text not null,
  can_create boolean not null default false,
  can_edit boolean not null default false,
  can_delete boolean not null default false,
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint employee_module_permissions_module_ck
    check (module_code in ('announcements', 'checklists', 'documents')),
  constraint employee_module_permissions_unique unique (organization_id, membership_id, module_code)
);

create index if not exists employee_module_permissions_org_idx
  on public.employee_module_permissions (organization_id);

create index if not exists employee_module_permissions_membership_idx
  on public.employee_module_permissions (membership_id);

drop trigger if exists set_updated_at_employee_module_permissions on public.employee_module_permissions;
create trigger set_updated_at_employee_module_permissions
before update on public.employee_module_permissions
for each row execute function public.set_updated_at();

create or replace function public.ensure_employee_membership_for_permissions()
returns trigger
language plpgsql
as $$
declare
  v_membership_org uuid;
  v_role_code text;
begin
  select m.organization_id, r.code
    into v_membership_org, v_role_code
  from public.memberships m
  join public.roles r on r.id = m.role_id
  where m.id = new.membership_id;

  if v_membership_org is null then
    raise exception 'Membership inexistente para employee_module_permissions';
  end if;

  if v_membership_org <> new.organization_id then
    raise exception 'organization_id no coincide con membership_id';
  end if;

  if v_role_code <> 'employee' then
    raise exception 'Solo se permiten memberships con rol employee';
  end if;

  return new;
end;
$$;

drop trigger if exists ensure_employee_membership_for_permissions_trg on public.employee_module_permissions;
create trigger ensure_employee_membership_for_permissions_trg
before insert or update on public.employee_module_permissions
for each row execute function public.ensure_employee_membership_for_permissions();

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
        (p_capability = 'create' and emp.can_create)
        or (p_capability = 'edit' and emp.can_edit)
        or (p_capability = 'delete' and emp.can_delete)
      )
  );
$$;

alter table public.employee_module_permissions enable row level security;

drop policy if exists employee_module_permissions_tenant_select on public.employee_module_permissions;
create policy employee_module_permissions_tenant_select
  on public.employee_module_permissions for select
  using (public.has_org_membership(organization_id));

drop policy if exists employee_module_permissions_tenant_manage on public.employee_module_permissions;
create policy employee_module_permissions_tenant_manage
  on public.employee_module_permissions for all
  using (public.can_manage_org(organization_id))
  with check (public.can_manage_org(organization_id));

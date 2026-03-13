create table if not exists public.department_positions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  department_id uuid not null references public.organization_departments(id) on delete cascade,
  code text,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists department_positions_org_dept_code_uk
  on public.department_positions(organization_id, department_id, code)
  where code is not null;

create unique index if not exists department_positions_org_dept_name_uk
  on public.department_positions(organization_id, department_id, lower(name));

drop trigger if exists set_department_positions_updated_at on public.department_positions;

create trigger set_department_positions_updated_at
before update on public.department_positions
for each row
execute function public.set_updated_at();

alter table public.department_positions enable row level security;

drop policy if exists department_positions_tenant_select on public.department_positions;

create policy department_positions_tenant_select
  on public.department_positions for select
  using (public.has_org_membership(organization_id));

drop policy if exists department_positions_tenant_manage on public.department_positions;

create policy department_positions_tenant_manage
  on public.department_positions for all
  using (public.can_manage_org(organization_id))
  with check (public.can_manage_org(organization_id));

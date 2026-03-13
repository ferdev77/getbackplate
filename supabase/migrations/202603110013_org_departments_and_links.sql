create table if not exists public.organization_departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists organization_departments_org_code_uk
  on public.organization_departments(organization_id, code)
  where code is not null;

create unique index if not exists organization_departments_org_name_uk
  on public.organization_departments(organization_id, lower(name));

drop trigger if exists set_organization_departments_updated_at on public.organization_departments;

create trigger set_organization_departments_updated_at
before update on public.organization_departments
for each row
execute function public.set_updated_at();

alter table public.organization_departments enable row level security;

drop policy if exists organization_departments_tenant_select on public.organization_departments;

create policy organization_departments_tenant_select
  on public.organization_departments for select
  using (public.has_org_membership(organization_id));

drop policy if exists organization_departments_tenant_manage on public.organization_departments;

create policy organization_departments_tenant_manage
  on public.organization_departments for all
  using (public.can_manage_org(organization_id))
  with check (public.can_manage_org(organization_id));

alter table public.employees
  add column if not exists department_id uuid references public.organization_departments(id) on delete set null;

alter table public.checklist_templates
  add column if not exists department_id uuid references public.organization_departments(id) on delete set null;

update public.employees e
set department_id = d.id
from public.organization_departments d
where e.department_id is null
  and e.department is not null
  and e.organization_id = d.organization_id
  and lower(e.department) = lower(d.name);

update public.checklist_templates t
set department_id = d.id
from public.organization_departments d
where t.department_id is null
  and t.department is not null
  and t.organization_id = d.organization_id
  and lower(t.department) = lower(d.name);

update public.checklist_templates
set target_scope = jsonb_set(
  target_scope - 'departments',
  '{department_ids}',
  coalesce(target_scope->'departments', '[]'::jsonb),
  true
)
where target_scope ? 'departments'
  and not (target_scope ? 'department_ids');

update public.document_folders
set access_scope = jsonb_set(
  access_scope - 'departments',
  '{department_ids}',
  coalesce(access_scope->'departments', '[]'::jsonb),
  true
)
where access_scope ? 'departments'
  and not (access_scope ? 'department_ids');

update public.documents
set access_scope = jsonb_set(
  access_scope - 'departments',
  '{department_ids}',
  coalesce(access_scope->'departments', '[]'::jsonb),
  true
)
where access_scope ? 'departments'
  and not (access_scope ? 'department_ids');

update public.announcements
set target_scope = jsonb_set(
  target_scope - 'departments',
  '{department_ids}',
  coalesce(target_scope->'departments', '[]'::jsonb),
  true
)
where target_scope ? 'departments'
  and not (target_scope ? 'department_ids');

create table if not exists public.maintenance_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  sort_order integer not null default 100,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, code)
);

create table if not exists public.maintenance_service_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid not null references public.maintenance_categories(id) on delete cascade,
  code text not null,
  name text not null,
  sort_order integer not null default 100,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, code)
);

create table if not exists public.maintenance_issue_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  service_item_id uuid not null references public.maintenance_service_items(id) on delete cascade,
  code text not null,
  name text not null,
  sort_order integer not null default 100,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, code)
);

create index if not exists idx_maintenance_categories_org_sort
  on public.maintenance_categories (organization_id, sort_order, name);

create index if not exists idx_maintenance_service_items_org_category_sort
  on public.maintenance_service_items (organization_id, category_id, sort_order, name);

create index if not exists idx_maintenance_issue_templates_org_item_sort
  on public.maintenance_issue_templates (organization_id, service_item_id, sort_order, name);

drop trigger if exists trg_maintenance_categories_updated_at on public.maintenance_categories;
create trigger trg_maintenance_categories_updated_at
  before update on public.maintenance_categories
  for each row execute function public.set_updated_at();

drop trigger if exists trg_maintenance_service_items_updated_at on public.maintenance_service_items;
create trigger trg_maintenance_service_items_updated_at
  before update on public.maintenance_service_items
  for each row execute function public.set_updated_at();

drop trigger if exists trg_maintenance_issue_templates_updated_at on public.maintenance_issue_templates;
create trigger trg_maintenance_issue_templates_updated_at
  before update on public.maintenance_issue_templates
  for each row execute function public.set_updated_at();

alter table public.maintenance_categories enable row level security;
alter table public.maintenance_service_items enable row level security;
alter table public.maintenance_issue_templates enable row level security;

drop policy if exists maintenance_categories_admin_all on public.maintenance_categories;
create policy maintenance_categories_admin_all
  on public.maintenance_categories
  for all
  to authenticated
  using (public.can_manage_org(organization_id))
  with check (public.can_manage_org(organization_id));

drop policy if exists maintenance_categories_employee_select on public.maintenance_categories;
create policy maintenance_categories_employee_select
  on public.maintenance_categories
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.memberships m
      inner join public.roles r on r.id = m.role_id
      where m.organization_id = maintenance_categories.organization_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and r.code = 'employee'
    )
  );

drop policy if exists maintenance_service_items_admin_all on public.maintenance_service_items;
create policy maintenance_service_items_admin_all
  on public.maintenance_service_items
  for all
  to authenticated
  using (public.can_manage_org(organization_id))
  with check (public.can_manage_org(organization_id));

drop policy if exists maintenance_service_items_employee_select on public.maintenance_service_items;
create policy maintenance_service_items_employee_select
  on public.maintenance_service_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.memberships m
      inner join public.roles r on r.id = m.role_id
      where m.organization_id = maintenance_service_items.organization_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and r.code = 'employee'
    )
  );

drop policy if exists maintenance_issue_templates_admin_all on public.maintenance_issue_templates;
create policy maintenance_issue_templates_admin_all
  on public.maintenance_issue_templates
  for all
  to authenticated
  using (public.can_manage_org(organization_id))
  with check (public.can_manage_org(organization_id));

drop policy if exists maintenance_issue_templates_employee_select on public.maintenance_issue_templates;
create policy maintenance_issue_templates_employee_select
  on public.maintenance_issue_templates
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.memberships m
      inner join public.roles r on r.id = m.role_id
      where m.organization_id = maintenance_issue_templates.organization_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and r.code = 'employee'
    )
  );

insert into public.maintenance_categories (organization_id, code, name, sort_order, is_system)
select
  o.id,
  seed.code,
  seed.name,
  seed.sort_order,
  true
from public.organizations o
cross join (
  values
    ('plumbing', 'Plomeria', 10),
    ('electrical', 'Electricidad', 20),
    ('equipment', 'Equipos', 30),
    ('cleaning', 'Limpieza', 40),
    ('hvac', 'HVAC', 50),
    ('safety', 'Seguridad', 60),
    ('other', 'Otro', 999)
) as seed(code, name, sort_order)
on conflict (organization_id, code) do update
set
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_system = true,
  is_active = true,
  updated_at = timezone('utc', now());

insert into public.maintenance_categories (organization_id, code, name, sort_order, is_system)
select distinct
  mr.organization_id,
  lower(regexp_replace(coalesce(mr.category, ''), '[^a-z0-9]+', '-', 'g')),
  initcap(trim(coalesce(mr.category, ''))),
  500,
  false
from public.maintenance_requests mr
where coalesce(trim(mr.category), '') <> ''
on conflict (organization_id, code) do nothing;

with seeded_items as (
  select
    c.organization_id,
    c.id as category_id,
    lower(regexp_replace(coalesce(mr.service_item, ''), '[^a-z0-9]+', '-', 'g')) as code,
    trim(mr.service_item) as name
  from public.maintenance_requests mr
  inner join public.maintenance_categories c
    on c.organization_id = mr.organization_id
   and lower(trim(c.name)) = lower(trim(mr.category))
  where coalesce(trim(mr.service_item), '') <> ''
)
insert into public.maintenance_service_items (organization_id, category_id, code, name, sort_order, is_system)
select distinct
  organization_id,
  category_id,
  code,
  initcap(name),
  500,
  false
from seeded_items
where code <> ''
on conflict (organization_id, code) do nothing;

with seeded_issues as (
  select
    mr.organization_id,
    si.id as service_item_id,
    lower(regexp_replace(coalesce(mr.issue, ''), '[^a-z0-9]+', '-', 'g')) as code,
    trim(mr.issue) as name
  from public.maintenance_requests mr
  inner join public.maintenance_categories c
    on c.organization_id = mr.organization_id
   and lower(trim(c.name)) = lower(trim(mr.category))
  inner join public.maintenance_service_items si
    on si.organization_id = mr.organization_id
   and si.category_id = c.id
   and lower(trim(si.name)) = lower(trim(mr.service_item))
  where coalesce(trim(mr.issue), '') <> ''
)
insert into public.maintenance_issue_templates (organization_id, service_item_id, code, name, sort_order, is_system)
select distinct
  organization_id,
  service_item_id,
  code,
  initcap(name),
  500,
  false
from seeded_issues
where code <> ''
on conflict (organization_id, code) do nothing;

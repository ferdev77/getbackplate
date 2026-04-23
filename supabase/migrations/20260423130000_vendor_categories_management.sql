create table if not exists public.vendor_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  sort_order integer not null default 100,
  is_system boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create index if not exists idx_vendor_categories_org_sort
  on public.vendor_categories(organization_id, sort_order, name);

drop trigger if exists trg_vendor_categories_updated_at on public.vendor_categories;
create trigger trg_vendor_categories_updated_at
  before update on public.vendor_categories
  for each row execute function public.set_updated_at();

alter table public.vendor_categories enable row level security;

drop policy if exists "vendor_categories_admin_all" on public.vendor_categories;
create policy "vendor_categories_admin_all"
  on public.vendor_categories
  for all
  to authenticated
  using (
    organization_id in (
      select m.organization_id
      from public.memberships m
      inner join public.roles r on r.id = m.role_id
      where m.user_id = auth.uid()
        and m.status = 'active'
        and r.code = 'company_admin'
    )
  )
  with check (
    organization_id in (
      select m.organization_id
      from public.memberships m
      inner join public.roles r on r.id = m.role_id
      where m.user_id = auth.uid()
        and m.status = 'active'
        and r.code = 'company_admin'
    )
  );

drop policy if exists "vendor_categories_employee_select" on public.vendor_categories;
create policy "vendor_categories_employee_select"
  on public.vendor_categories
  for select
  to authenticated
  using (
    organization_id in (
      select m.organization_id
      from public.memberships m
      inner join public.roles r on r.id = m.role_id
      where m.user_id = auth.uid()
        and m.status = 'active'
        and r.code = 'employee'
    )
  );

insert into public.vendor_categories (organization_id, code, name, sort_order, is_system)
select
  o.id,
  seed.code,
  seed.name,
  seed.sort_order,
  true
from public.organizations o
cross join (
  values
    ('alimentos', 'Alimentos', 10),
    ('bebidas', 'Bebidas', 20),
    ('equipos', 'Equipos', 30),
    ('limpieza', 'Limpieza', 40),
    ('mantenimiento', 'Mantenimiento', 50),
    ('empaque', 'Empaque', 60),
    ('otro', 'Otro', 999)
) as seed(code, name, sort_order)
on conflict (organization_id, code) do nothing;

insert into public.vendor_categories (organization_id, code, name, sort_order, is_system)
select distinct
  v.organization_id,
  lower(regexp_replace(coalesce(v.category, ''), '[^a-z0-9]+', '-', 'g')),
  initcap(replace(coalesce(v.category, ''), '-', ' ')),
  500,
  false
from public.vendors v
where coalesce(trim(v.category), '') <> ''
on conflict (organization_id, code) do nothing;

alter table public.vendors
  drop constraint if exists vendors_category_check;

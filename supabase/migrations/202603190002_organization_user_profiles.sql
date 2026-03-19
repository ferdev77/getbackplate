create table if not exists public.organization_user_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  branch_id uuid references public.branches(id) on delete set null,
  department_id uuid references public.organization_departments(id) on delete set null,
  position_id uuid references public.department_positions(id) on delete set null,
  first_name text,
  last_name text,
  email text,
  phone text,
  is_employee boolean not null default false,
  source text not null default 'users_employees_modal',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, user_id)
);

create index if not exists organization_user_profiles_org_idx
  on public.organization_user_profiles(organization_id);

create index if not exists organization_user_profiles_employee_idx
  on public.organization_user_profiles(employee_id)
  where employee_id is not null;

drop trigger if exists set_organization_user_profiles_updated_at on public.organization_user_profiles;
create trigger set_organization_user_profiles_updated_at
before update on public.organization_user_profiles
for each row
execute function public.set_updated_at();

alter table public.organization_user_profiles enable row level security;

drop policy if exists organization_user_profiles_select on public.organization_user_profiles;
create policy organization_user_profiles_select
  on public.organization_user_profiles for select
  using (
    public.is_superadmin()
    or public.can_manage_org(organization_id)
    or user_id = auth.uid()
  );

drop policy if exists organization_user_profiles_insert on public.organization_user_profiles;
create policy organization_user_profiles_insert
  on public.organization_user_profiles for insert
  with check (
    public.is_superadmin()
    or public.can_manage_org(organization_id)
    or (user_id = auth.uid() and public.has_org_membership(organization_id))
  );

drop policy if exists organization_user_profiles_update on public.organization_user_profiles;
create policy organization_user_profiles_update
  on public.organization_user_profiles for update
  using (
    public.is_superadmin()
    or public.can_manage_org(organization_id)
    or user_id = auth.uid()
  )
  with check (
    public.is_superadmin()
    or public.can_manage_org(organization_id)
    or user_id = auth.uid()
  );

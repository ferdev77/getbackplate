alter table public.employees
  add column if not exists location_scope_ids uuid[] not null default '{}'::uuid[];

alter table public.memberships
  add column if not exists location_scope_ids uuid[] not null default '{}'::uuid[];

alter table public.organization_user_profiles
  add column if not exists location_scope_ids uuid[] not null default '{}'::uuid[];

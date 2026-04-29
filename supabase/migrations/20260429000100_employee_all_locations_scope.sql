alter table public.employees
  add column if not exists all_locations boolean not null default false;

alter table public.memberships
  add column if not exists all_locations boolean not null default false;

alter table public.organization_user_profiles
  add column if not exists all_locations boolean not null default false;

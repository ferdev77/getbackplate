alter table public.organization_user_profiles
  alter column user_id drop not null;

alter table public.organization_user_profiles
  drop constraint if exists organization_user_profiles_organization_id_user_id_key;

create unique index if not exists organization_user_profiles_org_user_unique_idx
  on public.organization_user_profiles(organization_id, user_id)
  where user_id is not null;

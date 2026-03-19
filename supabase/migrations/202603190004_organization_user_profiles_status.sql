alter table public.organization_user_profiles
  add column if not exists status text not null default 'inactive';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'organization_user_profiles_status_check'
  ) then
    alter table public.organization_user_profiles
      add constraint organization_user_profiles_status_check
      check (status in ('active', 'inactive'));
  end if;
end
$$;

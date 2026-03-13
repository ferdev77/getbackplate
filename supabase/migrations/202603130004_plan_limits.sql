alter table public.plans
  add column if not exists max_branches integer,
  add column if not exists max_users integer,
  add column if not exists max_storage_mb integer,
  add column if not exists max_employees integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'plans_max_branches_non_negative'
  ) then
    alter table public.plans
      add constraint plans_max_branches_non_negative
      check (max_branches is null or max_branches >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'plans_max_users_non_negative'
  ) then
    alter table public.plans
      add constraint plans_max_users_non_negative
      check (max_users is null or max_users >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'plans_max_storage_mb_non_negative'
  ) then
    alter table public.plans
      add constraint plans_max_storage_mb_non_negative
      check (max_storage_mb is null or max_storage_mb >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'plans_max_employees_non_negative'
  ) then
    alter table public.plans
      add constraint plans_max_employees_non_negative
      check (max_employees is null or max_employees >= 0);
  end if;
end $$;

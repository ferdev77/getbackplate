alter table public.organizations
  add column if not exists billing_onboarding_required boolean not null default false,
  add column if not exists billing_activation_status text not null default 'active',
  add column if not exists billing_activated_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'organizations_billing_activation_status_check'
      and conrelid = 'public.organizations'::regclass
  ) then
    alter table public.organizations
      add constraint organizations_billing_activation_status_check
      check (billing_activation_status in ('pending', 'active', 'blocked'));
  end if;
end $$;

update public.organizations
set
  billing_onboarding_required = coalesce(billing_onboarding_required, false),
  billing_activation_status = case
    when billing_onboarding_required = false then 'active'
    when billing_activation_status is null then 'pending'
    else billing_activation_status
  end
where billing_activation_status is null
   or billing_onboarding_required is null;

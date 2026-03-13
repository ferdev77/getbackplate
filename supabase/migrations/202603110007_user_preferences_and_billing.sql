alter table public.organization_settings
  add column if not exists billing_plan text,
  add column if not exists billing_period text,
  add column if not exists billed_to text,
  add column if not exists billing_email text,
  add column if not exists payment_last4 text,
  add column if not exists invoice_emails_enabled boolean;

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  theme text not null default 'default',
  language text not null default 'es',
  date_format text not null default 'DD/MM/YYYY',
  timezone_mode text not null default 'auto' check (timezone_mode in ('auto', 'manual')),
  timezone_manual text,
  analytics_enabled boolean not null default true,
  two_factor_enabled boolean not null default false,
  two_factor_method text not null default 'app' check (two_factor_method in ('app', 'sms', 'email')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger set_user_preferences_updated_at
before update on public.user_preferences
for each row
execute function public.set_updated_at();

alter table public.user_preferences enable row level security;

create policy user_preferences_select_own_or_admin
  on public.user_preferences for select
  using (
    public.is_superadmin()
    or public.can_manage_org(organization_id)
    or user_id = auth.uid()
  );

create policy user_preferences_insert_own_or_admin
  on public.user_preferences for insert
  with check (
    public.is_superadmin()
    or public.can_manage_org(organization_id)
    or (user_id = auth.uid() and public.has_org_membership(organization_id))
  );

create policy user_preferences_update_own_or_admin
  on public.user_preferences for update
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

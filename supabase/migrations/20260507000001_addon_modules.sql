-- Add addon fields to module_catalog
alter table public.module_catalog
  add column if not exists is_available_as_addon boolean not null default false,
  add column if not exists addon_stripe_price_id  text,
  add column if not exists addon_name             text,
  add column if not exists addon_description      text,
  add column if not exists addon_price_amount     numeric(10,2),
  add column if not exists addon_currency_code    text default 'USD';

-- Table that tracks which organizations have purchased which add-ons
create table if not exists public.organization_addons (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations(id) on delete cascade,
  module_id               uuid not null references public.module_catalog(id) on delete cascade,
  stripe_subscription_id  text unique,
  stripe_customer_id      text,
  status                  text not null default 'inactive',
  current_period_end      timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (organization_id, module_id)
);

-- updated_at trigger
create or replace function public.set_organization_addons_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_organization_addons_updated_at
  before update on public.organization_addons
  for each row execute function public.set_organization_addons_updated_at();

-- RLS
alter table public.organization_addons enable row level security;

-- Org members can read their own add-ons
create policy "org members can read own addons"
  on public.organization_addons for select
  using (
    organization_id in (
      select organization_id
      from public.memberships
      where user_id = auth.uid() and status = 'active'
    )
  );

-- Service role can do everything (webhooks use service role)
create policy "service role full access on organization_addons"
  on public.organization_addons for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Index for fast lookups
create index if not exists idx_organization_addons_org_id
  on public.organization_addons (organization_id);

create index if not exists idx_organization_addons_stripe_sub
  on public.organization_addons (stripe_subscription_id);

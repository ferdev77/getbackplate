create table if not exists public.organization_domains (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  domain text not null unique,
  status text not null default 'pending_dns' check (
    status in ('pending_dns', 'verifying_ssl', 'active', 'error', 'disabled')
  ),
  verification_error text,
  is_primary boolean not null default false,
  dns_target text,
  provider text not null default 'vercel',
  verified_at timestamptz,
  activated_at timestamptz,
  last_checked_at timestamptz,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists organization_domains_primary_per_org_idx
  on public.organization_domains(organization_id)
  where is_primary = true;

create index if not exists organization_domains_org_status_idx
  on public.organization_domains(organization_id, status);

create index if not exists organization_domains_status_idx
  on public.organization_domains(status);

create trigger set_organization_domains_updated_at
before update on public.organization_domains
for each row
execute function public.set_updated_at();

alter table public.organization_domains enable row level security;

create policy organization_domains_tenant_select
  on public.organization_domains for select
  using (public.has_org_membership(organization_id));

create policy organization_domains_tenant_manage
  on public.organization_domains for all
  using (public.can_manage_org(organization_id))
  with check (public.can_manage_org(organization_id));

create policy organization_domains_superadmin_manage
  on public.organization_domains for all
  using (public.is_superadmin())
  with check (public.is_superadmin());

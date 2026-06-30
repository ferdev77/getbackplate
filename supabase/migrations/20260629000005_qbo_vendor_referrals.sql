-- Registro de referidos de vendors: cuando una sucursal (cliente de Prodel,
-- ej. Taco Palenque) refiere a uno de sus propios vendors para que tambien
-- automatice la entrega de facturas via GetBackplate. El link de referido en
-- el reporte semanal lleva un token firmado que identifica la sucursal
-- (organization_id + qbo_r365_sync_config_customers.id), no requiere login.

create table if not exists public.qbo_vendor_referrals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sync_config_customer_id uuid not null references public.qbo_r365_sync_config_customers(id) on delete cascade,
  referrer_branch_name text not null,
  vendor_company text not null,
  vendor_contact_name text not null,
  vendor_email text not null,
  vendor_phone text not null,
  outreach_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists qbo_vendor_referrals_org_idx
  on public.qbo_vendor_referrals(organization_id);

alter table public.qbo_vendor_referrals enable row level security;

drop policy if exists qbo_vendor_referrals_company_admin_select on public.qbo_vendor_referrals;
create policy qbo_vendor_referrals_company_admin_select
  on public.qbo_vendor_referrals
  for select
  to authenticated
  using (
    organization_id in (
      select m.organization_id
      from public.memberships m
      join public.roles r on r.id = m.role_id
      where m.user_id = auth.uid()
        and m.status = 'active'
        and r.code = 'company_admin'
    )
  );

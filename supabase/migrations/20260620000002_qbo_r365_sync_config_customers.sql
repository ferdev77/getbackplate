-- Permite que una sync config (1 slot) agrupe varios clientes QBO (sucursales)
-- que comparten el mismo FTP/vendor/template de R365. Un cliente QBO no puede
-- estar en dos sync configs distintas (UNIQUE organization_id + qbo_customer_id),
-- para que la resolucion de webhook por CustomerRef sea inequivoca.

create table if not exists public.qbo_r365_sync_config_customers (
  id uuid primary key default gen_random_uuid(),
  sync_config_id uuid not null references public.qbo_r365_sync_configs(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  qbo_customer_id text not null,
  qbo_customer_name text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (organization_id, qbo_customer_id)
);

create index if not exists qbo_r365_sync_config_customers_sync_config_idx
  on public.qbo_r365_sync_config_customers(sync_config_id);

alter table public.qbo_r365_sync_config_customers enable row level security;

drop policy if exists qbo_r365_sync_config_customers_company_admin_all on public.qbo_r365_sync_config_customers;
create policy qbo_r365_sync_config_customers_company_admin_all
  on public.qbo_r365_sync_config_customers
  for all
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
  )
  with check (
    organization_id in (
      select m.organization_id
      from public.memberships m
      join public.roles r on r.id = m.role_id
      where m.user_id = auth.uid()
        and m.status = 'active'
        and r.code = 'company_admin'
    )
  );

-- Backfill: cada sync config existente (hoy 1 cliente por fila) queda con
-- exactamente 1 fila hija, replicando el estado actual sin intervencion manual.
insert into public.qbo_r365_sync_config_customers
  (sync_config_id, organization_id, qbo_customer_id, qbo_customer_name, created_at)
select id, organization_id, qbo_customer_id, qbo_customer_name, created_at
from public.qbo_r365_sync_configs
where qbo_customer_id is not null and qbo_customer_id <> ''
on conflict (organization_id, qbo_customer_id) do nothing;

-- Tabla de configuraciones de sincronización por cliente QBO
create table if not exists public.qbo_r365_sync_configs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  qbo_customer_id text not null,
  qbo_customer_name text not null,
  schedule_interval text not null default 'manual'
    check (schedule_interval in ('manual', 'hourly', 'daily', 'weekly')),
  -- Credenciales FTP de R365 propias de esta config (encriptadas igual que integration_connections)
  r365_ftp_host text,
  r365_ftp_port integer default 21,
  r365_ftp_username text,
  r365_ftp_secrets_ciphertext text,
  r365_ftp_secrets_iv text,
  r365_ftp_secrets_tag text,
  r365_ftp_remote_path text not null default '/APImports/R365',
  r365_ftp_secure boolean not null default false,
  -- Template y tax_mode propios (sobrescriben el global de integration_settings)
  template text not null default 'by_item'
    check (template in ('by_item', 'by_item_service_dates', 'by_account', 'by_account_service_dates')),
  tax_mode text not null default 'none'
    check (tax_mode in ('line', 'header', 'none')),
  status text not null default 'active'
    check (status in ('active', 'paused')),
  last_run_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Cada run puede estar asociada a una sync config específica
alter table public.integration_runs
  add column if not exists sync_config_id uuid references public.qbo_r365_sync_configs(id) on delete set null;

-- Índices
create index if not exists qbo_r365_sync_configs_org_idx
  on public.qbo_r365_sync_configs(organization_id);

create index if not exists qbo_r365_sync_configs_status_schedule_idx
  on public.qbo_r365_sync_configs(status, schedule_interval)
  where status = 'active';

create index if not exists integration_runs_sync_config_idx
  on public.integration_runs(sync_config_id)
  where sync_config_id is not null;

-- Trigger updated_at
create or replace function public.set_qbo_r365_sync_configs_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger qbo_r365_sync_configs_updated_at
  before update on public.qbo_r365_sync_configs
  for each row execute function public.set_qbo_r365_sync_configs_updated_at();

-- RLS: solo company_admin de la misma org
alter table public.qbo_r365_sync_configs enable row level security;

drop policy if exists qbo_r365_sync_configs_company_admin_all on public.qbo_r365_sync_configs;
create policy qbo_r365_sync_configs_company_admin_all
  on public.qbo_r365_sync_configs
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

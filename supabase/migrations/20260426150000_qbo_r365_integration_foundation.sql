create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('quickbooks_online', 'restaurant365_ftp')),
  status text not null default 'disconnected' check (status in ('disconnected', 'connected', 'error')),
  config jsonb not null default '{}'::jsonb,
  secrets_ciphertext text,
  secrets_iv text,
  secrets_tag text,
  connected_at timestamptz,
  last_error text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider)
);

create table if not exists public.integration_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  qbo_r365_template text not null default 'by_item' check (qbo_r365_template in ('by_item', 'by_account')),
  tax_mode text not null default 'line' check (tax_mode in ('line', 'header', 'none')),
  timezone text not null default 'UTC',
  file_prefix text not null default 'r365_multi_invoice',
  ftp_remote_path text not null default '/APImports/R365',
  incremental_lookback_hours integer not null default 24 check (incremental_lookback_hours between 1 and 720),
  max_retry_attempts integer not null default 3 check (max_retry_attempts between 0 and 10),
  is_enabled boolean not null default false,
  last_run_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id)
);

create table if not exists public.integration_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_system text not null default 'qbo',
  target_system text not null default 'r365_multi_invoice',
  target_field text not null,
  source_field text,
  transform_rule jsonb not null default '{}'::jsonb,
  is_required boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, target_system, target_field)
);

create table if not exists public.integration_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  triggered_by_user_id uuid references auth.users(id) on delete set null,
  trigger_source text not null default 'manual' check (trigger_source in ('manual', 'scheduled', 'retry')),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'completed_with_errors', 'failed', 'cancelled')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  qbo_window_from timestamptz,
  qbo_window_to timestamptz,
  template_used text,
  file_name text,
  file_hash text,
  total_detected integer not null default 0,
  total_mapped integer not null default 0,
  total_uploaded integer not null default 0,
  total_skipped_duplicates integer not null default 0,
  total_failed integer not null default 0,
  error_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.integration_run_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.integration_runs(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_invoice_id text,
  source_invoice_line_id text,
  dedupe_key text,
  status text not null default 'detected' check (status in ('detected', 'mapped', 'validated', 'exported', 'uploaded', 'skipped_duplicate', 'failed_validation', 'failed_delivery', 'needs_review')),
  error_code text,
  error_detail text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.integration_outbox_files (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.integration_runs(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  storage_provider text not null default 'r365_ftp',
  remote_path text,
  file_name text not null,
  mime_type text not null default 'text/csv',
  size_bytes bigint,
  sha256 text,
  uploaded_at timestamptz,
  status text not null default 'generated' check (status in ('generated', 'uploaded', 'failed')),
  error_detail text,
  created_at timestamptz not null default now()
);

create table if not exists public.integration_audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid references public.integration_runs(id) on delete cascade,
  run_item_id uuid references public.integration_run_items(id) on delete cascade,
  level text not null default 'info' check (level in ('info', 'warn', 'error')),
  code text,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_integration_connections_org_provider
  on public.integration_connections(organization_id, provider);

create index if not exists idx_integration_runs_org_started
  on public.integration_runs(organization_id, started_at desc);

create index if not exists idx_integration_run_items_org_status
  on public.integration_run_items(organization_id, status, created_at desc);

create index if not exists idx_integration_run_items_org_dedupe
  on public.integration_run_items(organization_id, dedupe_key);

create index if not exists idx_integration_outbox_org_created
  on public.integration_outbox_files(organization_id, created_at desc);

create index if not exists idx_integration_audit_logs_org_created
  on public.integration_audit_logs(organization_id, created_at desc);

drop trigger if exists trg_integration_connections_updated_at on public.integration_connections;
create trigger trg_integration_connections_updated_at
before update on public.integration_connections
for each row execute function public.set_updated_at();

drop trigger if exists trg_integration_settings_updated_at on public.integration_settings;
create trigger trg_integration_settings_updated_at
before update on public.integration_settings
for each row execute function public.set_updated_at();

drop trigger if exists trg_integration_mappings_updated_at on public.integration_mappings;
create trigger trg_integration_mappings_updated_at
before update on public.integration_mappings
for each row execute function public.set_updated_at();

drop trigger if exists trg_integration_run_items_updated_at on public.integration_run_items;
create trigger trg_integration_run_items_updated_at
before update on public.integration_run_items
for each row execute function public.set_updated_at();

alter table public.integration_connections enable row level security;
alter table public.integration_settings enable row level security;
alter table public.integration_mappings enable row level security;
alter table public.integration_runs enable row level security;
alter table public.integration_run_items enable row level security;
alter table public.integration_outbox_files enable row level security;
alter table public.integration_audit_logs enable row level security;

drop policy if exists integration_connections_company_admin_all on public.integration_connections;
create policy integration_connections_company_admin_all
  on public.integration_connections
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

drop policy if exists integration_settings_company_admin_all on public.integration_settings;
create policy integration_settings_company_admin_all
  on public.integration_settings
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

drop policy if exists integration_mappings_company_admin_all on public.integration_mappings;
create policy integration_mappings_company_admin_all
  on public.integration_mappings
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

drop policy if exists integration_runs_company_admin_all on public.integration_runs;
create policy integration_runs_company_admin_all
  on public.integration_runs
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

drop policy if exists integration_run_items_company_admin_all on public.integration_run_items;
create policy integration_run_items_company_admin_all
  on public.integration_run_items
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

drop policy if exists integration_outbox_files_company_admin_all on public.integration_outbox_files;
create policy integration_outbox_files_company_admin_all
  on public.integration_outbox_files
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

drop policy if exists integration_audit_logs_company_admin_all on public.integration_audit_logs;
create policy integration_audit_logs_company_admin_all
  on public.integration_audit_logs
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

-- ==========================================
-- REGISTRO DEL MÓDULO EN EL CATÁLOGO
-- ==========================================
insert into public.module_catalog (code, name, description, is_core)
values (
  'qbo_r365', 
  'Integración QuickBooks', 
  'Sincronización de facturas desde QuickBooks Online a Restaurant365.', 
  false
)
on conflict (code) do nothing;

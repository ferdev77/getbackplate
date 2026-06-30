-- Reporte semanal de facturas QBO -> R365: email de respaldo manual por
-- cliente/sucursal (solo se usa si QuickBooks no trae BillEmail en ninguna
-- factura de ese cliente) y tabla de control para no duplicar envios.

alter table public.qbo_r365_sync_config_customers
  add column if not exists contact_email_override text;

create table if not exists public.qbo_weekly_invoice_report_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  sent_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (organization_id, period_start)
);

create index if not exists qbo_weekly_invoice_report_runs_org_idx
  on public.qbo_weekly_invoice_report_runs(organization_id);

alter table public.qbo_weekly_invoice_report_runs enable row level security;

drop policy if exists qbo_weekly_invoice_report_runs_company_admin_select on public.qbo_weekly_invoice_report_runs;
create policy qbo_weekly_invoice_report_runs_company_admin_select
  on public.qbo_weekly_invoice_report_runs
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

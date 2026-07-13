-- Control anti-duplicados para el reporte semanal de operaciones al owner
-- (qbo_owner_weekly_ops_report). Se registra por destinatario individual,
-- no solo por periodo, para que si un envio falla para uno de los owners
-- pero tiene exito para otro, un reintento no le vuelva a mandar el correo
-- a quien ya lo recibio esa semana.

create table if not exists public.qbo_owner_weekly_report_runs (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  recipient_email text not null,
  sent_at timestamptz not null default now(),
  unique (period_start, recipient_email)
);

create index if not exists qbo_owner_weekly_report_runs_period_idx
  on public.qbo_owner_weekly_report_runs(period_start);

alter table public.qbo_owner_weekly_report_runs enable row level security;

drop policy if exists qbo_owner_weekly_report_runs_superadmin_select on public.qbo_owner_weekly_report_runs;
create policy qbo_owner_weekly_report_runs_superadmin_select
  on public.qbo_owner_weekly_report_runs
  for select
  to authenticated
  using (public.is_superadmin());

drop policy if exists qbo_owner_weekly_report_runs_service_all on public.qbo_owner_weekly_report_runs;
create policy qbo_owner_weekly_report_runs_service_all
  on public.qbo_owner_weekly_report_runs
  for all
  to service_role
  using (true)
  with check (true);

-- Historial de corridas del cron de recovery (processQboUnifiedQueue).
-- Antes, los contadores de esa funcion (processed/completed/failed/skipped)
-- se calculaban y se perdian apenas terminaba la ejecucion. Se necesitan
-- guardados para poder sumarlos por semana en el reporte operativo del owner
-- (cuantas facturas se autocuraron via reintento vs. cuantas siguen atascadas).

create table if not exists public.qbo_recovery_run_log (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  processed integer not null default 0,
  completed integer not null default 0,
  failed integer not null default 0,
  skipped integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists qbo_recovery_run_log_ran_at_idx
  on public.qbo_recovery_run_log(ran_at desc);

alter table public.qbo_recovery_run_log enable row level security;

drop policy if exists qbo_recovery_run_log_superadmin_select on public.qbo_recovery_run_log;
create policy qbo_recovery_run_log_superadmin_select
  on public.qbo_recovery_run_log
  for select
  to authenticated
  using (public.is_superadmin());

drop policy if exists qbo_recovery_run_log_service_all on public.qbo_recovery_run_log;
create policy qbo_recovery_run_log_service_all
  on public.qbo_recovery_run_log
  for all
  to service_role
  using (true)
  with check (true);

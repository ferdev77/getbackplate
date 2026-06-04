-- Agrega 'processing' como estado válido de announcement_deliveries.
-- Permite un claim atómico (UPDATE status='processing' WHERE status='queued')
-- para evitar que dos procesos concurrentes envíen el mismo delivery dos veces.

alter table public.announcement_deliveries
  drop constraint if exists announcement_deliveries_status_check;

alter table public.announcement_deliveries
  add constraint announcement_deliveries_status_check
  check (status in ('queued', 'processing', 'sent', 'failed'));

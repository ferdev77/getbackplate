-- Quita 'whatsapp' del canal de avisos (se elimina ese canal de la plataforma)
-- y agrega 'push', que ya se inserta desde el codigo pero faltaba en este constraint.
-- No se tocan filas historicas existentes con channel='whatsapp'.
alter table public.announcement_deliveries
  drop constraint if exists announcement_deliveries_channel_check;

alter table public.announcement_deliveries
  add constraint announcement_deliveries_channel_check
  check (channel in ('in_app', 'sms', 'email', 'push'));

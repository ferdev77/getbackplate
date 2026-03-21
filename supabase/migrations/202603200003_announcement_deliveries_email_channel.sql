alter table public.announcement_deliveries
  drop constraint if exists announcement_deliveries_channel_check;

alter table public.announcement_deliveries
  add constraint announcement_deliveries_channel_check
  check (channel in ('in_app', 'whatsapp', 'sms', 'email'));

-- Agrega lookback_hours por sync config (antes era global en integration_settings)
alter table public.qbo_r365_sync_configs
  add column if not exists lookback_hours integer not null default 48
    check (lookback_hours >= 0 and lookback_hours <= 8760);

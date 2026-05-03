alter table public.integration_settings
  drop constraint if exists integration_settings_incremental_lookback_hours_check;

alter table public.integration_settings
  add constraint integration_settings_incremental_lookback_hours_check
  check (incremental_lookback_hours between 0 and 8760);

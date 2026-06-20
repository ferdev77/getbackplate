-- Restringe el template QBO -> R365 a unicamente 'by_item' (11 columnas).
-- R365 confirmo que solo recibe ese formato; los otros 3 (by_item_service_dates,
-- by_account, by_account_service_dates) nunca se usaron en produccion.

alter table if exists public.integration_settings
  drop constraint if exists integration_settings_qbo_r365_template_check;

alter table if exists public.integration_settings
  add constraint integration_settings_qbo_r365_template_check
  check (qbo_r365_template in ('by_item'));

alter table if exists public.qbo_r365_sync_configs
  drop constraint if exists qbo_r365_sync_configs_template_check;

alter table if exists public.qbo_r365_sync_configs
  add constraint qbo_r365_sync_configs_template_check
  check (template in ('by_item'));

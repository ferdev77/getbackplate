-- Permite variantes de template con service dates

alter table if exists public.integration_settings
  drop constraint if exists integration_settings_qbo_r365_template_check;

alter table if exists public.integration_settings
  add constraint integration_settings_qbo_r365_template_check
  check (
    qbo_r365_template in (
      'by_item',
      'by_item_service_dates',
      'by_account',
      'by_account_service_dates'
    )
  );

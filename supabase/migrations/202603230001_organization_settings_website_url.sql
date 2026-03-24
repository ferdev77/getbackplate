alter table public.organization_settings
  add column if not exists website_url text;

update public.organization_settings
set website_url = dashboard_note
where website_url is null
  and dashboard_note is not null
  and dashboard_note <> ''
  and (
    dashboard_note ~* '^https?://' or
    dashboard_note ~* '^www\.'
  );

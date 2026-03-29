alter table public.organization_settings
  add column if not exists company_logo_url text,
  add column if not exists company_logo_path text;

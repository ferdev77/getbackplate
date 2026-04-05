alter table public.organization_settings
  add column if not exists company_favicon_url text,
  add column if not exists company_favicon_path text;

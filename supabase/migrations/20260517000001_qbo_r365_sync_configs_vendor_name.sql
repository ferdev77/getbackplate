alter table public.qbo_r365_sync_configs
  add column if not exists r365_vendor_name text;

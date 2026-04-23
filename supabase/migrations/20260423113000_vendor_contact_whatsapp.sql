alter table public.vendors
  add column if not exists contact_whatsapp text;

create index if not exists idx_vendors_org_whatsapp
  on public.vendors(organization_id, contact_whatsapp);

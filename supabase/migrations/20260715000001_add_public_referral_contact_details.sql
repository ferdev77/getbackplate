alter table public.qbo_public_vendor_referrals
  add column if not exists referrer_email text,
  add column if not exists vendor_company text,
  add column if not exists vendor_contact_name text;

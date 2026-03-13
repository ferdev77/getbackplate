alter table public.employee_contracts
  add column if not exists signer_name text,
  add column if not exists signed_at date;

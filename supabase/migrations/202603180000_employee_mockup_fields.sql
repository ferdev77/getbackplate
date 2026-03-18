alter table public.employees
  add column if not exists document_type text,
  add column if not exists document_number text,
  add column if not exists personal_email text;

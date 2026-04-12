alter table public.employee_documents
  add column if not exists has_no_expiration boolean not null default false;

create index if not exists employee_documents_no_expiration_idx
  on public.employee_documents (organization_id, has_no_expiration);

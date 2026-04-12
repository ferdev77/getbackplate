alter table public.employee_documents
  add column if not exists signature_status text,
  add column if not exists signature_provider text,
  add column if not exists signature_submission_id bigint,
  add column if not exists signature_submitter_slug text,
  add column if not exists signature_embed_src text,
  add column if not exists signature_requested_by uuid,
  add column if not exists signature_requested_at timestamptz,
  add column if not exists signature_completed_at timestamptz,
  add column if not exists signature_error text;

create index if not exists employee_documents_signature_status_idx
  on public.employee_documents (organization_id, signature_status);

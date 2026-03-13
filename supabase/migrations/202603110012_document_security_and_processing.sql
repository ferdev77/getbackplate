alter table public.documents
  add column if not exists original_file_name text,
  add column if not exists checksum_sha256 text;

create index if not exists documents_org_checksum_idx
  on public.documents (organization_id, checksum_sha256, file_size_bytes)
  where checksum_sha256 is not null;

create table if not exists public.document_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  job_type text not null default 'post_upload' check (job_type in ('post_upload')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  attempts integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists set_document_processing_jobs_updated_at on public.document_processing_jobs;

create trigger set_document_processing_jobs_updated_at
before update on public.document_processing_jobs
for each row
execute function public.set_updated_at();

alter table public.document_processing_jobs enable row level security;

drop policy if exists document_processing_jobs_tenant_select on public.document_processing_jobs;

create policy document_processing_jobs_tenant_select
  on public.document_processing_jobs for select
  using (public.has_org_membership(organization_id));

drop policy if exists document_processing_jobs_tenant_manage on public.document_processing_jobs;

create policy document_processing_jobs_tenant_manage
  on public.document_processing_jobs for all
  using (public.can_manage_org(organization_id))
  with check (public.can_manage_org(organization_id));

alter table public.employee_documents
  add column if not exists requested_without_file boolean not null default false,
  add column if not exists pending_since_at timestamptz,
  add column if not exists pending_reminder_stage integer not null default 0,
  add column if not exists pending_reminder_last_sent_at timestamptz;

update public.employee_documents
set pending_since_at = coalesce(pending_since_at, created_at)
where status = 'pending'
  and pending_since_at is null;

update public.employee_documents
set pending_since_at = null
where status <> 'pending'
  and pending_since_at is not null;

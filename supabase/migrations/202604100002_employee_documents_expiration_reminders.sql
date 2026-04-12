alter table public.employee_documents
  add column if not exists expires_at date,
  add column if not exists reminder_days integer,
  add column if not exists reminder_last_sent_at timestamptz,
  add column if not exists reminder_sent_for_date date;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'employee_documents_reminder_days_check'
      and conrelid = 'public.employee_documents'::regclass
  ) then
    alter table public.employee_documents
      add constraint employee_documents_reminder_days_check
      check (reminder_days is null or reminder_days in (15, 30, 45));
  end if;
end $$;

create index if not exists employee_documents_expiration_idx
  on public.employee_documents (organization_id, status, expires_at);

alter table public.qbo_webhook_events
  add column if not exists raw_notification jsonb not null default '{}'::jsonb,
  add column if not exists raw_headers jsonb not null default '{}'::jsonb,
  add column if not exists fetched_entity jsonb,
  add column if not exists imported_at timestamptz,
  add column if not exists imported_by uuid references auth.users(id) on delete set null;

alter table public.qbo_webhook_events
  drop constraint if exists qbo_webhook_events_status_check;

alter table public.qbo_webhook_events
  add constraint qbo_webhook_events_status_check
  check (status in ('captured', 'imported_manual', 'ignored', 'failed'));

update public.qbo_webhook_events
set status = 'captured'
where status in ('pending', 'processing', 'processed');

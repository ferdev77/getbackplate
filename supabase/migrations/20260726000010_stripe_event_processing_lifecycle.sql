alter table public.stripe_processed_events
  add column if not exists event_type text,
  add column if not exists stripe_created_at timestamptz,
  add column if not exists started_at timestamptz not null default timezone('utc', now()),
  add column if not exists completed_at timestamptz,
  add column if not exists attempt_count integer not null default 1,
  add column if not exists last_error text;

alter table public.stripe_processed_events
  drop constraint if exists stripe_processed_events_status_check;

alter table public.stripe_processed_events
  add constraint stripe_processed_events_status_check
  check (status in ('processing', 'processed', 'failed'));

update public.stripe_processed_events
set completed_at = coalesce(completed_at, processed_at)
where status = 'processed' and completed_at is null;

create index if not exists stripe_processed_events_status_started_idx
  on public.stripe_processed_events(status, started_at);

notify pgrst, 'reload schema';

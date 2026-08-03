-- Close recovery edge cases found after exercising the first rollout in dev.

create table if not exists public.stripe_event_reconciliation_queue (
  event_id text primary key references public.stripe_processed_events(event_id) on delete cascade,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'resolved', 'ignored')),
  attempt_count integer not null default 1,
  last_error text,
  first_queued_at timestamptz not null default timezone('utc', now()),
  last_queued_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz,
  resolution_notes text
);

create index if not exists stripe_event_reconciliation_pending_idx
  on public.stripe_event_reconciliation_queue(last_queued_at)
  where status = 'pending';

alter table public.stripe_event_reconciliation_queue enable row level security;
drop policy if exists stripe_event_reconciliation_superadmin_select on public.stripe_event_reconciliation_queue;
create policy stripe_event_reconciliation_superadmin_select
  on public.stripe_event_reconciliation_queue for select to authenticated
  using (public.is_superadmin());
drop policy if exists stripe_event_reconciliation_superadmin_update on public.stripe_event_reconciliation_queue;
create policy stripe_event_reconciliation_superadmin_update
  on public.stripe_event_reconciliation_queue for update to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());
drop policy if exists stripe_event_reconciliation_service_all on public.stripe_event_reconciliation_queue;
create policy stripe_event_reconciliation_service_all
  on public.stripe_event_reconciliation_queue for all to service_role
  using (true) with check (true);

create or replace function public.queue_stripe_event_reconciliation(
  p_event_id text,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.stripe_processed_events%rowtype;
begin
  select * into v_event
  from public.stripe_processed_events event_row
  where event_row.event_id = p_event_id;
  if not found then raise exception 'stripe_event_not_found' using errcode = 'P0002'; end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'stripe_reconciliation_reason_required' using errcode = '22023';
  end if;

  insert into public.stripe_event_reconciliation_queue(
    event_id, reason, status, attempt_count, last_error, first_queued_at, last_queued_at
  ) values (
    p_event_id, p_reason, 'pending', v_event.attempt_count, v_event.last_error,
    clock_timestamp(), clock_timestamp()
  ) on conflict (event_id) do update
    set reason = excluded.reason,
        status = 'pending',
        attempt_count = excluded.attempt_count,
        last_error = excluded.last_error,
        last_queued_at = clock_timestamp(),
        resolved_at = null,
        resolution_notes = null;
  return true;
end;
$$;

insert into public.stripe_event_reconciliation_queue(
  event_id, reason, status, attempt_count, last_error, first_queued_at, last_queued_at
)
select event_id,
  case when status = 'dead_lettered' then 'dead_lettered' else 'legacy_tokenless' end,
  'pending', attempt_count, last_error, clock_timestamp(), clock_timestamp()
from public.stripe_processed_events
where status = 'dead_lettered'
  or (status in ('processing', 'failed') and processing_token is null)
on conflict (event_id) do nothing;

create or replace function public.apply_manual_payment_order_transaction_v2(
  p_order_id uuid,
  p_event_id text,
  p_checkout_session_id text,
  p_metadata_organization_id uuid,
  p_amount_subtotal integer,
  p_amount_total integer,
  p_currency text,
  p_payment_intent_id text,
  p_customer_email text,
  p_paid_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_amount_subtotal <= 0 or p_amount_total < p_amount_subtotal then
    raise exception 'manual_payment_total_below_order_amount' using errcode = '22023';
  end if;
  return public.apply_manual_payment_order_transaction(
    p_order_id,
    p_event_id,
    p_checkout_session_id,
    p_metadata_organization_id,
    p_amount_subtotal,
    p_amount_total,
    p_currency,
    p_payment_intent_id,
    p_customer_email,
    p_paid_at
  );
end;
$$;

revoke all on public.stripe_event_reconciliation_queue from public, anon;
grant select, update on public.stripe_event_reconciliation_queue to authenticated;
grant select, insert, update on public.stripe_event_reconciliation_queue to service_role;
revoke all on function public.queue_stripe_event_reconciliation(text, text) from public, anon, authenticated;
revoke all on function public.apply_manual_payment_order_transaction(uuid, text, text, uuid, integer, integer, text, text, text, timestamptz) from service_role;
revoke all on function public.apply_manual_payment_order_transaction_v2(uuid, text, text, uuid, integer, integer, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.queue_stripe_event_reconciliation(text, text) to service_role;
grant execute on function public.apply_manual_payment_order_transaction_v2(uuid, text, text, uuid, integer, integer, text, text, text, timestamptz) to service_role;

notify pgrst, 'reload schema';

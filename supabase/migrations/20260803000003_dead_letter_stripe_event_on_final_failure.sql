-- Dead-letter and queue the final failed attempt atomically, without relying on
-- Stripe to deliver the event one more time.

create or replace function public.fail_stripe_event_v2(
  p_event_id text,
  p_processing_token uuid,
  p_error text,
  p_retry_after_seconds integer default 30,
  p_max_attempts integer default 8
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if p_max_attempts < 1 then
    raise exception 'invalid_stripe_max_attempts' using errcode = '22023';
  end if;

  update public.stripe_processed_events event_row
  set status = case when event_row.attempt_count >= p_max_attempts then 'dead_lettered' else 'failed' end,
      completed_at = clock_timestamp(),
      dead_lettered_at = case when event_row.attempt_count >= p_max_attempts then clock_timestamp() else null end,
      processing_token = case when event_row.attempt_count >= p_max_attempts then null else p_processing_token end,
      next_attempt_at = case when event_row.attempt_count >= p_max_attempts then null
        else clock_timestamp() + make_interval(secs => greatest(p_retry_after_seconds, 0)) end,
      last_error = left(coalesce(p_error, 'unknown_error'), 2000)
  where event_row.event_id = p_event_id
    and event_row.status = 'processing'
    and event_row.processing_token = p_processing_token
  returning status into v_status;

  if not found then return false; end if;
  if v_status = 'dead_lettered' then
    perform public.queue_stripe_event_reconciliation(p_event_id, 'dead_lettered');
  end if;
  return true;
end;
$$;

revoke all on function public.fail_stripe_event(text, uuid, text, integer) from service_role;
revoke all on function public.fail_stripe_event_v2(text, uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.fail_stripe_event_v2(text, uuid, text, integer, integer) to service_role;

notify pgrst, 'reload schema';

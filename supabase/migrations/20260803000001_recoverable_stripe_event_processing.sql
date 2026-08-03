-- Recoverable Stripe event claims and transactionally idempotent paid effects.

alter table public.stripe_processed_events
  add column if not exists processing_token uuid,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists dead_lettered_at timestamptz;

alter table public.stripe_processed_events
  drop constraint if exists stripe_processed_events_status_check;
alter table public.stripe_processed_events
  add constraint stripe_processed_events_status_check
  check (status in ('processing', 'processed', 'failed', 'dead_lettered'));

do $$ begin
  alter table public.stripe_processed_events
    add constraint stripe_processed_events_attempt_count_check check (attempt_count >= 1);
exception when duplicate_object then null;
end $$;

create index if not exists stripe_processed_events_retry_idx
  on public.stripe_processed_events(status, next_attempt_at, started_at)
  where status in ('processing', 'failed');

create table if not exists public.stripe_event_effects (
  effect_key text primary key,
  event_id text not null,
  effect_type text not null,
  organization_id uuid references public.organizations(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  applied_at timestamptz not null default timezone('utc', now())
);

create index if not exists stripe_event_effects_event_idx
  on public.stripe_event_effects(event_id, applied_at);

alter table public.stripe_event_effects enable row level security;
revoke all on public.stripe_event_effects from public, anon, authenticated;
grant select, insert on public.stripe_event_effects to service_role;

create or replace function public.claim_stripe_event(
  p_event_id text,
  p_event_type text,
  p_stripe_created_at timestamptz,
  p_lease_seconds integer default 600,
  p_max_attempts integer default 8
)
returns table (outcome text, processing_token uuid, attempt_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.stripe_processed_events%rowtype;
  v_token uuid := gen_random_uuid();
begin
  if coalesce(btrim(p_event_id), '') = ''
    or p_lease_seconds < 30
    or p_max_attempts < 1 then
    raise exception 'invalid_stripe_event_claim' using errcode = '22023';
  end if;

  insert into public.stripe_processed_events (
    event_id, event_type, stripe_created_at, status, started_at,
    last_attempt_at, attempt_count, processing_token, completed_at,
    next_attempt_at, last_error
  ) values (
    p_event_id, p_event_type, p_stripe_created_at, 'processing', clock_timestamp(),
    clock_timestamp(), 1, v_token, null, null, null
  ) on conflict (event_id) do nothing
  returning * into v_row;

  if found then
    return query select 'claimed'::text, v_token, 1;
    return;
  end if;

  select * into v_row
  from public.stripe_processed_events event_row
  where event_row.event_id = p_event_id
  for update;

  if v_row.status = 'processed' then
    return query select 'processed'::text, null::uuid, v_row.attempt_count;
    return;
  end if;
  if v_row.status = 'dead_lettered' then
    return query select 'dead_lettered'::text, null::uuid, v_row.attempt_count;
    return;
  end if;

  -- Rows created before this migration may already have partial effects. They
  -- require explicit reconciliation and must never be replayed automatically.
  if v_row.processing_token is null then
    return query select 'legacy_blocked'::text, null::uuid, v_row.attempt_count;
    return;
  end if;

  if v_row.status = 'processing'
    and v_row.started_at > clock_timestamp() - make_interval(secs => p_lease_seconds) then
    return query select 'busy'::text, null::uuid, v_row.attempt_count;
    return;
  end if;
  if v_row.status = 'failed' and v_row.next_attempt_at is not null
    and v_row.next_attempt_at > clock_timestamp() then
    return query select 'busy'::text, null::uuid, v_row.attempt_count;
    return;
  end if;

  if v_row.attempt_count >= p_max_attempts then
    update public.stripe_processed_events event_row
    set status = 'dead_lettered', dead_lettered_at = clock_timestamp(),
        completed_at = clock_timestamp(), processing_token = null
    where event_row.event_id = p_event_id;
    return query select 'dead_lettered'::text, null::uuid, v_row.attempt_count;
    return;
  end if;

  update public.stripe_processed_events event_row
  set status = 'processing', event_type = p_event_type,
      stripe_created_at = coalesce(p_stripe_created_at, event_row.stripe_created_at),
      started_at = clock_timestamp(), last_attempt_at = clock_timestamp(),
      completed_at = null, next_attempt_at = null, processing_token = v_token,
      attempt_count = event_row.attempt_count + 1
  where event_row.event_id = p_event_id
  returning * into v_row;

  return query select 'claimed'::text, v_token, v_row.attempt_count;
end;
$$;

create or replace function public.complete_stripe_event(
  p_event_id text,
  p_processing_token uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  with completed as (
    update public.stripe_processed_events event_row
    set status = 'processed', completed_at = clock_timestamp(),
        processed_at = clock_timestamp(), processing_token = null,
        next_attempt_at = null, last_error = null
    where event_row.event_id = p_event_id
      and event_row.status = 'processing'
      and event_row.processing_token = p_processing_token
    returning 1
  )
  select exists(select 1 from completed);
$$;

create or replace function public.fail_stripe_event(
  p_event_id text,
  p_processing_token uuid,
  p_error text,
  p_retry_after_seconds integer default 30
)
returns boolean
language sql
security definer
set search_path = public
as $$
  with failed as (
    update public.stripe_processed_events event_row
    set status = 'failed', completed_at = clock_timestamp(),
        processing_token = p_processing_token,
        next_attempt_at = clock_timestamp() + make_interval(secs => greatest(p_retry_after_seconds, 0)),
        last_error = left(coalesce(p_error, 'unknown_error'), 2000)
    where event_row.event_id = p_event_id
      and event_row.status = 'processing'
      and event_row.processing_token = p_processing_token
    returning 1
  )
  select exists(select 1 from failed);
$$;

create or replace function public.apply_stripe_increment_once(
  p_event_id text,
  p_effect_key text,
  p_organization_id uuid,
  p_module_id uuid,
  p_effect_type text,
  p_amount integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_addon_id uuid;
begin
  if p_amount <= 0 or p_effect_type not in ('invoice_balance', 'r365_slots')
    or coalesce(btrim(p_effect_key), '') = '' then
    raise exception 'invalid_stripe_increment' using errcode = '22023';
  end if;

  if exists (select 1 from public.stripe_event_effects effect where effect.effect_key = p_effect_key) then
    return false;
  end if;

  select addon.id into v_addon_id
  from public.organization_addons addon
  where addon.organization_id = p_organization_id
    and addon.module_id = p_module_id
    and addon.status = 'active'
  for update;
  if not found then
    raise exception 'stripe_increment_target_not_found' using errcode = 'P0002';
  end if;

  if p_effect_type = 'invoice_balance' then
    update public.organization_addons set invoice_balance = invoice_balance + p_amount where id = v_addon_id;
  else
    update public.organization_addons set extra_r365_connections = extra_r365_connections + p_amount where id = v_addon_id;
  end if;

  insert into public.stripe_event_effects(effect_key, event_id, effect_type, organization_id, metadata)
  values (p_effect_key, p_event_id, p_effect_type, p_organization_id,
    jsonb_build_object('module_id', p_module_id, 'amount', p_amount));
  return true;
exception when unique_violation then
  return false;
end;
$$;

create or replace function public.apply_manual_payment_order_transaction(
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
declare
  v_order public.manual_payment_orders%rowtype;
  v_items jsonb;
  v_item jsonb;
  v_action_type text;
  v_action_payload jsonb;
  v_index integer := 0;
  v_module_id uuid;
  v_amount integer;
  v_effect_key text;
begin
  select * into v_order from public.manual_payment_orders where id = p_order_id for update;
  if not found then raise exception 'manual_payment_order_not_found' using errcode = 'P0002'; end if;

  if v_order.status = 'paid' and v_order.stripe_session_id = p_checkout_session_id then return false; end if;
  if v_order.status <> 'pending'
    or v_order.organization_id is distinct from p_metadata_organization_id
    or v_order.stripe_session_id is distinct from p_checkout_session_id
    or v_order.amount_cents is distinct from p_amount_subtotal
    or lower(v_order.currency) is distinct from lower(p_currency) then
    raise exception 'manual_payment_order_mismatch' using errcode = '22023';
  end if;

  v_items := case
    when jsonb_typeof(v_order.items) = 'array' and jsonb_array_length(v_order.items) > 0 then v_order.items
    else jsonb_build_array(jsonb_build_object(
      'action_type', v_order.action_type,
      'action_payload', coalesce(v_order.action_payload, '{}'::jsonb)
    ))
  end;

  for v_item in select value from jsonb_array_elements(v_items) loop
    v_action_type := v_item->>'action_type';
    v_action_payload := coalesce(v_item->'action_payload', '{}'::jsonb);
    v_effect_key := format('manual-order:%s:item:%s', p_order_id, v_index);

    if v_action_type = 'activate_module' then
      select id into v_module_id from public.module_catalog where code = v_action_payload->>'moduleCode';
      if not found then raise exception 'manual_payment_module_not_found' using errcode = 'P0002'; end if;
      insert into public.organization_modules(organization_id, module_id, is_enabled, enabled_at)
      values (v_order.organization_id, v_module_id, true, clock_timestamp())
      on conflict (organization_id, module_id) do update
      set is_enabled = true, enabled_at = excluded.enabled_at;
    elsif v_action_type in ('add_invoices', 'add_slot') then
      v_amount := case when v_action_type = 'add_invoices'
        then (v_action_payload->>'invoiceCount')::integer
        else (v_action_payload->>'slotCount')::integer end;
      if v_amount <= 0 then raise exception 'invalid_manual_payment_action' using errcode = '22023'; end if;
      select module.id into v_module_id from public.module_catalog module where module.code = 'qbo_r365';
      if not found then raise exception 'qbo_r365_module_not_found' using errcode = 'P0002'; end if;
      perform public.apply_stripe_increment_once(
        p_event_id, v_effect_key, v_order.organization_id, v_module_id,
        case when v_action_type = 'add_invoices' then 'invoice_balance' else 'r365_slots' end,
        v_amount
      );
    elsif v_action_type <> 'custom' then
      raise exception 'invalid_manual_payment_action' using errcode = '22023';
    end if;

    if v_action_type in ('activate_module', 'custom') then
      insert into public.stripe_event_effects(effect_key, event_id, effect_type, organization_id, metadata)
      values (v_effect_key, p_event_id, v_action_type, v_order.organization_id,
        jsonb_build_object('order_id', p_order_id, 'item_index', v_index))
      on conflict (effect_key) do nothing;
    end if;
    v_index := v_index + 1;
  end loop;

  insert into public.billing_records(
    organization_id, record_type, source_event_id, stripe_payment_intent_id,
    stripe_checkout_session_id, amount_cents, currency, paid_at, description, metadata
  ) values (
    v_order.organization_id, 'manual_payment', 'checkout_session:' || p_checkout_session_id,
    p_payment_intent_id, p_checkout_session_id, greatest(p_amount_total, 0), lower(p_currency),
    p_paid_at, 'Manual payment order', jsonb_build_object('manualPaymentOrderId', p_order_id)
  ) on conflict (source_event_id) do nothing;

  update public.manual_payment_orders
  set status = 'paid', paid_at = p_paid_at, stripe_payment_intent_id = p_payment_intent_id,
      customer_email = p_customer_email
  where id = p_order_id;
  return true;
end;
$$;

revoke all on function public.claim_stripe_event(text, text, timestamptz, integer, integer) from public, anon, authenticated;
revoke all on function public.complete_stripe_event(text, uuid) from public, anon, authenticated;
revoke all on function public.fail_stripe_event(text, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.apply_stripe_increment_once(text, text, uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.apply_manual_payment_order_transaction(uuid, text, text, uuid, integer, integer, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_stripe_event(text, text, timestamptz, integer, integer) to service_role;
grant execute on function public.complete_stripe_event(text, uuid) to service_role;
grant execute on function public.fail_stripe_event(text, uuid, text, integer) to service_role;
grant execute on function public.apply_stripe_increment_once(text, text, uuid, uuid, text, integer) to service_role;
grant execute on function public.apply_manual_payment_order_transaction(uuid, text, text, uuid, integer, integer, text, text, text, timestamptz) to service_role;

notify pgrst, 'reload schema';

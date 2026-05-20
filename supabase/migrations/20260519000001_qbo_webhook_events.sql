create table if not exists public.qbo_webhook_events (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  signature_valid boolean not null default false,
  intuit_event_id text,
  realm_id text not null,
  entity text not null,
  entity_id text not null,
  operation text not null,
  last_updated_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'processing', 'processed', 'ignored', 'failed')),
  ignore_reason text,
  attempts integer not null default 0,
  organization_id uuid references public.organizations(id) on delete set null,
  sync_config_id uuid references public.qbo_r365_sync_configs(id) on delete set null,
  run_id uuid references public.integration_runs(id) on delete set null,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_qbo_webhook_events_dedupe
  on public.qbo_webhook_events(realm_id, entity, entity_id, operation, coalesce(last_updated_at, 'epoch'::timestamptz));

create index if not exists idx_qbo_webhook_events_status_received
  on public.qbo_webhook_events(status, received_at asc);

create index if not exists idx_qbo_webhook_events_org_received
  on public.qbo_webhook_events(organization_id, received_at desc);

drop trigger if exists trg_qbo_webhook_events_updated_at on public.qbo_webhook_events;
create trigger trg_qbo_webhook_events_updated_at
before update on public.qbo_webhook_events
for each row execute function public.set_updated_at();

alter table public.qbo_webhook_events enable row level security;

drop policy if exists qbo_webhook_events_company_admin_all on public.qbo_webhook_events;
create policy qbo_webhook_events_company_admin_all
  on public.qbo_webhook_events
  for all
  to authenticated
  using (
    organization_id in (
      select m.organization_id
      from public.memberships m
      join public.roles r on r.id = m.role_id
      where m.user_id = auth.uid()
        and m.status = 'active'
        and r.code = 'company_admin'
    )
  )
  with check (
    organization_id in (
      select m.organization_id
      from public.memberships m
      join public.roles r on r.id = m.role_id
      where m.user_id = auth.uid()
        and m.status = 'active'
        and r.code = 'company_admin'
    )
  );

do $$
begin
  alter publication supabase_realtime add table public.qbo_webhook_events;
exception
  when duplicate_object then null;
end $$;

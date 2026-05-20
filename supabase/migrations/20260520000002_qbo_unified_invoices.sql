-- ============================================================
-- Tabla maestra unificada de facturas/créditos QBO
--
-- CONTEXTO
-- --------
-- Cada Invoice y CreditMemo de QBO se registra UNA sola vez aquí,
-- independientemente de si llegó por sync histórico o por webhook.
--
-- PIPELINE
-- --------
-- en_cola  → webhook recibido, entity_id conocida, sin datos completos aún
-- capturada → entity completa obtenida desde QBO API, raw_entity poblado
-- mapeada  → template CSV generado y/o previsualizado por el usuario
-- enviada  → archivo enviado a R365 exitosamente
--
-- EXTENSIBILIDAD
-- --------------
-- Para webhooks futuros: INSERT con en_cola, luego UPDATE a capturada.
-- Para sync histórico: INSERT directo con capturada.
-- ============================================================

create table if not exists public.qbo_unified_invoices (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  sync_config_id      uuid references public.qbo_r365_sync_configs(id) on delete set null,
  webhook_event_id    uuid references public.qbo_webhook_events(id) on delete set null,
  entity_id           text not null,
  entity_type         text not null check (entity_type in ('Invoice', 'CreditMemo')),
  import_source       text not null check (import_source in ('sync', 'webhook')),
  pipeline_status     text not null default 'en_cola'
    check (pipeline_status in ('en_cola', 'capturada', 'mapeada', 'enviada')),
  doc_number          text,
  txn_date            date,
  due_date            date,
  total_amount        numeric(14,2),
  currency            text,
  customer_name       text,
  vendor_name         text,
  raw_entity          jsonb,
  fetched_at          timestamptz,
  mapped_at           timestamptz,
  sent_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (organization_id, entity_id, entity_type)
);

create index if not exists qbo_unified_invoices_org_date_idx
  on public.qbo_unified_invoices(organization_id, txn_date desc nulls last, created_at desc);

create index if not exists qbo_unified_invoices_org_status_idx
  on public.qbo_unified_invoices(organization_id, pipeline_status);

create index if not exists qbo_unified_invoices_sync_config_idx
  on public.qbo_unified_invoices(sync_config_id)
  where sync_config_id is not null;

drop trigger if exists trg_qbo_unified_invoices_updated_at on public.qbo_unified_invoices;
create trigger trg_qbo_unified_invoices_updated_at
  before update on public.qbo_unified_invoices
  for each row execute function public.set_updated_at();

alter table public.qbo_unified_invoices enable row level security;

drop policy if exists qbo_unified_invoices_company_admin_all on public.qbo_unified_invoices;
create policy qbo_unified_invoices_company_admin_all
  on public.qbo_unified_invoices
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
  alter publication supabase_realtime add table public.qbo_unified_invoices;
exception
  when duplicate_object then null;
end $$;

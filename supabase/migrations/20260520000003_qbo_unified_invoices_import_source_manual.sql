-- Agrega 'manual' como valor válido de import_source
-- para facturas traídas manualmente por DocNumber desde el dashboard.

alter table public.qbo_unified_invoices
  drop constraint if exists qbo_unified_invoices_import_source_check;

alter table public.qbo_unified_invoices
  add constraint qbo_unified_invoices_import_source_check
  check (import_source in ('sync', 'webhook', 'manual'));

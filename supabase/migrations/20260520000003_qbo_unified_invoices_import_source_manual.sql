-- Extiende el CHECK constraint de import_source en qbo_unified_invoices
-- para permitir el valor 'manual', correspondiente a facturas traídas
-- individualmente por DocNumber desde el buscador del dashboard.
--
-- Valores finales del constraint:
--   'sync'    → factura ingresada por el pipeline de sync (backfill o run diario)
--   'webhook' → factura recibida vía webhook de QBO
--   'manual'  → factura buscada y traída manualmente por DocNumber desde el dashboard
--
-- Se hace DROP + ADD porque ALTER TABLE ... MODIFY CONSTRAINT no existe en PostgreSQL.

alter table public.qbo_unified_invoices
  drop constraint if exists qbo_unified_invoices_import_source_check;

alter table public.qbo_unified_invoices
  add constraint qbo_unified_invoices_import_source_check
  check (import_source in ('sync', 'webhook', 'manual'));

-- ============================================================
-- Claim atómico para qbo_unified_invoices
--
-- CONTEXTO
-- --------
-- El pipeline tiene dos caminos automáticos que pueden llegar a la misma
-- factura: el fast-path del webhook (after()) y el cron de recovery
-- (processQboUnifiedQueue, autodisparado tras cada webhook + diario).
-- Sin coordinación, ambos podían procesar la misma factura en paralelo,
-- duplicando el envío al FTP de R365 y la notificación push.
--
-- claimed_at funciona como una reserva de corta duración: el proceso que
-- logra actualizar la fila (UPDATE atómico de Postgres) es el único que
-- continúa; el otro ve 0 filas afectadas y se retira sin hacer nada.
-- Si un claim queda a medias (proceso murió), expira a los 15 minutos y
-- vuelve a estar disponible para el próximo cron.
-- ============================================================

alter table public.qbo_unified_invoices
  add column if not exists claimed_at timestamptz;

create index if not exists qbo_unified_invoices_claim_idx
  on public.qbo_unified_invoices(pipeline_status, claimed_at)
  where pipeline_status <> 'enviada';

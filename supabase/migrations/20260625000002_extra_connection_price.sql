-- ============================================================
-- Precio recurrente mensual para conexiones extra de R365
-- (Additional Connection Fee del MSA, $80.00 USD/mes c/u).
-- El Price ID real se setea con un script puntual contra Stripe,
-- esta migracion solo agrega la columna donde se guarda.
-- ============================================================

alter table public.module_catalog
  add column if not exists extra_connection_stripe_price_id text;

comment on column public.module_catalog.extra_connection_stripe_price_id is
  'Stripe Price ID recurrente mensual para conexiones R365 extra (solo aplica a qbo_r365).';

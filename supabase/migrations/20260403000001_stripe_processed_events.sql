-- ============================================================
-- Deduplicación de webhooks de Stripe en base de datos
-- Reemplaza el Map en memoria (no funciona en Vercel serverless)
-- ============================================================

CREATE TABLE IF NOT EXISTS stripe_processed_events (
  event_id    TEXT        PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para limpiezas periódicas por fecha
CREATE INDEX IF NOT EXISTS idx_stripe_processed_events_processed_at
  ON stripe_processed_events (processed_at);

-- Habilitar RLS (la tabla solo se accede desde service_role en el webhook)
ALTER TABLE stripe_processed_events ENABLE ROW LEVEL SECURITY;

-- Ningún usuario autenticado puede leer ni escribir esta tabla directamente
CREATE POLICY "No public access to stripe_processed_events"
  ON stripe_processed_events
  FOR ALL
  TO authenticated
  USING (false);

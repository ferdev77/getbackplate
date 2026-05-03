-- Agrega columna status a stripe_processed_events
-- Antes: en caso de error se eliminaba el registro (riesgo de cobro doble en retry)
-- Ahora: se marca como 'failed' para que Stripe no reintente el mismo evento
ALTER TABLE stripe_processed_events
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'processed'
    CHECK (status IN ('processed', 'failed'));

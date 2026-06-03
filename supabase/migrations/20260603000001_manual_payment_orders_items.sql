-- Add items column to support multi-item manual payment orders.
-- Each item: { description, amount_cents, action_type, action_payload }.
-- NULL means legacy single-item order (actions read from action_type/action_payload columns).

ALTER TABLE public.manual_payment_orders
  ADD COLUMN IF NOT EXISTS items JSONB;

COMMENT ON COLUMN public.manual_payment_orders.items IS
  'Array of line items for multi-item orders. Schema: [{description, amount_cents, action_type, action_payload}]. NULL for legacy single-item orders.';

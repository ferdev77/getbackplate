-- Add payment traceability fields to manual_payment_orders.
-- Populated by the webhook when checkout.session.completed fires.
ALTER TABLE public.manual_payment_orders
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS customer_email            TEXT;

COMMENT ON COLUMN public.manual_payment_orders.stripe_payment_intent_id IS
  'Stripe PaymentIntent ID — links directly to the Stripe dashboard payment record.';
COMMENT ON COLUMN public.manual_payment_orders.customer_email IS
  'Email provided by the customer at Stripe checkout.';

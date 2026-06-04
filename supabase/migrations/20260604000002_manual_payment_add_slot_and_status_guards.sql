-- Keep manual payment order actions aligned with the live UI/API contract.
-- This migration only hardens forward-looking flows.

ALTER TABLE public.manual_payment_orders
  DROP CONSTRAINT IF EXISTS mpo_action_type_ck;

ALTER TABLE public.manual_payment_orders
  ADD CONSTRAINT mpo_action_type_ck
  CHECK (action_type IN ('activate_module', 'add_invoices', 'add_slot', 'custom'));

COMMENT ON COLUMN public.manual_payment_orders.action_type IS
  'activate_module: enables module on payment | add_invoices: credits invoice_balance | add_slot: credits extra R365 slots | custom: no automatic action';

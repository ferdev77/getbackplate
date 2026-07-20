-- Preserve paid R365 purchase evidence after tenant deletion and keep the
-- seven-year retention job index-backed as fiscal data grows.

ALTER TABLE public.r365_connection_purchases ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE public.r365_connection_purchases
  DROP CONSTRAINT IF EXISTS r365_connection_purchases_organization_id_fkey;
ALTER TABLE public.r365_connection_purchases
  ADD CONSTRAINT r365_connection_purchases_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS manual_payment_orders_paid_retention_idx
  ON public.manual_payment_orders (paid_at) WHERE status = 'paid';
CREATE INDEX IF NOT EXISTS manual_subscription_orders_completed_retention_idx
  ON public.manual_subscription_orders (completed_at)
  WHERE status IN ('completed', 'upgraded');
CREATE INDEX IF NOT EXISTS r365_connection_purchases_applied_retention_idx
  ON public.r365_connection_purchases (applied_at) WHERE status = 'paid_applied';

NOTIFY pgrst, 'reload schema';

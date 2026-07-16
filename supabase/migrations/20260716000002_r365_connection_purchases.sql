-- Tracks self-service recurring R365 connection purchases until Stripe confirms payment.
CREATE TABLE IF NOT EXISTS public.r365_connection_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.module_catalog(id) ON DELETE RESTRICT,
  stripe_subscription_id text NOT NULL,
  extra_price_id text NOT NULL,
  delta_quantity integer NOT NULL CHECK (delta_quantity > 0),
  target_quantity integer NOT NULL CHECK (target_quantity > 0),
  stripe_subscription_item_id text,
  stripe_invoice_id text UNIQUE,
  status text NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment', 'payment_failed', 'paid_applied', 'voided')),
  request_key uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  applied_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS r365_connection_purchases_one_pending_per_addon
  ON public.r365_connection_purchases (organization_id, module_id)
  WHERE status = 'pending_payment';

CREATE OR REPLACE FUNCTION public.set_r365_connection_purchase_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_r365_connection_purchases_updated_at ON public.r365_connection_purchases;
CREATE TRIGGER trg_r365_connection_purchases_updated_at
  BEFORE UPDATE ON public.r365_connection_purchases
  FOR EACH ROW EXECUTE FUNCTION public.set_r365_connection_purchase_updated_at();

ALTER TABLE public.r365_connection_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS r365_connection_purchases_service_role ON public.r365_connection_purchases;
CREATE POLICY r365_connection_purchases_service_role
  ON public.r365_connection_purchases FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.apply_r365_connection_purchase(p_purchase_id uuid)
RETURNS TABLE(applied boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  purchase public.r365_connection_purchases%ROWTYPE;
BEGIN
  SELECT * INTO purchase
  FROM public.r365_connection_purchases
  WHERE id = p_purchase_id
  FOR UPDATE;

  IF NOT FOUND OR purchase.status <> 'pending_payment' THEN
    RETURN QUERY SELECT false;
    RETURN;
  END IF;

  UPDATE public.organization_addons
  SET extra_r365_connections = extra_r365_connections + purchase.delta_quantity,
      updated_at = timezone('utc', now())
  WHERE organization_id = purchase.organization_id
    AND module_id = purchase.module_id
    AND stripe_subscription_id = purchase.stripe_subscription_id
    AND status = 'active';

  IF NOT FOUND THEN
    RETURN QUERY SELECT false;
    RETURN;
  END IF;

  UPDATE public.r365_connection_purchases
  SET status = 'paid_applied', applied_at = timezone('utc', now())
  WHERE id = purchase.id;

  RETURN QUERY SELECT true;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_r365_connection_purchase(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_r365_connection_purchase(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

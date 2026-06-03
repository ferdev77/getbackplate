-- Extra R365 sync slots purchased via manual payment links (add_slot action).
-- Added on top of the plan's base max_r365_connections quota.

ALTER TABLE public.organization_addons
  ADD COLUMN IF NOT EXISTS extra_r365_connections INTEGER NOT NULL DEFAULT 0
    CONSTRAINT oa_extra_r365_non_negative CHECK (extra_r365_connections >= 0);

COMMENT ON COLUMN public.organization_addons.extra_r365_connections IS
  'Extra R365 sync slots purchased by the org via payment links. Added on top of plans.max_r365_connections to compute the effective limit.';

-- Atomic RPC used by the webhook when processing an add_slot manual payment.
CREATE OR REPLACE FUNCTION public.increment_r365_slots(
  p_organization_id UUID,
  p_amount          INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.organization_addons
  SET    extra_r365_connections = extra_r365_connections + p_amount,
         updated_at             = timezone('utc', now())
  WHERE  id = (
    SELECT id FROM public.organization_addons
    WHERE  organization_id = p_organization_id
      AND  status = 'active'
    ORDER  BY created_at
    LIMIT  1
  );
END;
$$;

COMMENT ON FUNCTION public.increment_r365_slots IS
  'Atomically increments extra_r365_connections on the active addon for an org. Called by the add_slot webhook handler.';

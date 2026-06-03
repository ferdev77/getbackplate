-- ============================================================
-- manual_payment_orders
-- Ad-hoc Stripe Checkout Sessions created from superadmin.
-- Superadmin picks an org, sets amount + description + action,
-- generates a one-time checkout URL and shares it with the org.
-- On payment, the webhook executes the configured action.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.manual_payment_orders (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID        REFERENCES public.organizations(id) ON DELETE SET NULL,
  created_by        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,

  -- What the org is paying for
  description       TEXT        NOT NULL,
  internal_notes    TEXT,

  -- Pricing (always in cents — same convention as Stripe)
  amount_cents      INTEGER     NOT NULL CONSTRAINT mpo_amount_positive CHECK (amount_cents > 0),
  currency          TEXT        NOT NULL DEFAULT 'usd',

  -- What happens automatically when the payment succeeds
  --   activate_module → enables a module in organization_modules
  --   add_invoices    → increments organization_addons.invoice_balance
  --   custom          → records the payment, no automatic side-effect
  action_type       TEXT        NOT NULL DEFAULT 'custom'
    CONSTRAINT mpo_action_type_ck CHECK (action_type IN ('activate_module', 'add_invoices', 'custom')),

  -- Structured payload for the action handler:
  --   activate_module → { "moduleCode": "maintenance" }
  --   add_invoices    → { "invoiceCount": 500 }
  --   custom          → null or {}
  action_payload    JSONB,

  -- Stripe references
  stripe_session_id TEXT        UNIQUE,
  checkout_url      TEXT,

  -- Lifecycle
  status            TEXT        NOT NULL DEFAULT 'pending'
    CONSTRAINT mpo_status_ck CHECK (status IN ('pending', 'paid', 'expired', 'canceled')),
  paid_at           TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Extra invoice balance credited via manual payments (on top of plan quota)
ALTER TABLE public.organization_addons
  ADD COLUMN IF NOT EXISTS invoice_balance INTEGER NOT NULL DEFAULT 0;

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_mpo_org
  ON public.manual_payment_orders (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mpo_status
  ON public.manual_payment_orders (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mpo_session
  ON public.manual_payment_orders (stripe_session_id);

-- ── RLS — superadmin only ────────────────────────────────────
ALTER TABLE public.manual_payment_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mpo_superadmin_all ON public.manual_payment_orders;
CREATE POLICY mpo_superadmin_all
  ON public.manual_payment_orders
  FOR ALL
  TO authenticated
  USING  (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

-- ── updated_at trigger ───────────────────────────────────────
DROP TRIGGER IF EXISTS trg_mpo_updated_at ON public.manual_payment_orders;
CREATE TRIGGER trg_mpo_updated_at
  BEFORE UPDATE ON public.manual_payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Comments ─────────────────────────────────────────────────
COMMENT ON TABLE  public.manual_payment_orders IS
  'Ad-hoc Stripe Checkout Sessions created by superadmin. Each row represents one payment link sent to an organization.';
COMMENT ON COLUMN public.manual_payment_orders.action_type IS
  'activate_module: enables module on payment | add_invoices: credits invoice_balance | custom: no automatic action';
COMMENT ON COLUMN public.manual_payment_orders.action_payload IS
  'JSON config for action handler. activate_module → {"moduleCode":"maintenance"} | add_invoices → {"invoiceCount":500}';
COMMENT ON COLUMN public.organization_addons.invoice_balance IS
  'Extra invoices credited via manual payments (add_invoices action). Added on top of the plan quota.';

-- ── RPC: atomic invoice balance increment ────────────────────
-- Used by the webhook to safely add invoices without race conditions.
CREATE OR REPLACE FUNCTION public.increment_invoice_balance(
  p_organization_id UUID,
  p_amount          INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.organization_addons
  SET    invoice_balance = invoice_balance + p_amount,
         updated_at      = timezone('utc', now())
  WHERE  id = (
    SELECT id FROM public.organization_addons
    WHERE  organization_id = p_organization_id
      AND  status = 'active'
    ORDER  BY created_at
    LIMIT  1
  );
END;
$$;

COMMENT ON FUNCTION public.increment_invoice_balance IS
  'Atomically increments invoice_balance on the active addon for an org. Called by the manual payment webhook handler.';

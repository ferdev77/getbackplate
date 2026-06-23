-- ============================================================
-- manual_subscription_orders
-- Links de suscripcion recurrente generados desde superadmin, sin que el
-- admin de la organizacion tenga que loguearse (plan de plataforma o plan
-- de integracion QBO-R365). Espejo de manual_payment_orders, pero para
-- Stripe Checkout en modo "subscription" en vez de "payment".
--
-- Si la organizacion ya tiene una suscripcion activa de ese tipo, no se
-- genera link: el cambio de plan se aplica al instante (prorateo sobre la
-- tarjeta ya guardada, igual que el flujo logueado existente) y la fila
-- queda con status='upgraded' solo para trazabilidad.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.manual_subscription_orders (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID        REFERENCES public.organizations(id) ON DELETE SET NULL,
  created_by        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,

  plan_kind         TEXT        NOT NULL
    CONSTRAINT mso_plan_kind_ck CHECK (plan_kind IN ('platform', 'integration')),
  plan_id           UUID        NOT NULL REFERENCES public.plans(id),
  billing_period    TEXT        NOT NULL
    CONSTRAINT mso_billing_period_ck CHECK (billing_period IN ('monthly', 'yearly')),
  include_setup_fee BOOLEAN     NOT NULL DEFAULT false,

  -- pending/completed/expired/canceled = paso por Stripe Checkout (alta nueva)
  -- upgraded = prorateo aplicado al instante, nunca hubo link para copiar
  status            TEXT        NOT NULL DEFAULT 'pending'
    CONSTRAINT mso_status_ck CHECK (status IN ('pending', 'completed', 'expired', 'canceled', 'upgraded')),

  stripe_session_id TEXT        UNIQUE,
  checkout_url      TEXT,
  completed_at      TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_mso_org
  ON public.manual_subscription_orders (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mso_status
  ON public.manual_subscription_orders (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mso_session
  ON public.manual_subscription_orders (stripe_session_id);

-- ── RLS — superadmin only ────────────────────────────────────
ALTER TABLE public.manual_subscription_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mso_superadmin_all ON public.manual_subscription_orders;
CREATE POLICY mso_superadmin_all
  ON public.manual_subscription_orders
  FOR ALL
  TO authenticated
  USING  (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

-- ── updated_at trigger ───────────────────────────────────────
DROP TRIGGER IF EXISTS trg_mso_updated_at ON public.manual_subscription_orders;
CREATE TRIGGER trg_mso_updated_at
  BEFORE UPDATE ON public.manual_subscription_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Comments ─────────────────────────────────────────────────
COMMENT ON TABLE  public.manual_subscription_orders IS
  'Links de suscripcion recurrente (plataforma o integracion QBO-R365) generados por superadmin sin requerir login del cliente. Espejo de manual_payment_orders pero en modo subscription.';
COMMENT ON COLUMN public.manual_subscription_orders.status IS
  'pending/completed/expired/canceled: flujo de link via Stripe Checkout (alta nueva). upgraded: cambio de plan aplicado al instante via proration, sin link.';

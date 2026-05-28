-- Add integration-specific fields to plans table
-- plan_type distinguishes platform plans from integration landing plans
-- New fields allow superadmin to configure integration plan cards shown on public landing pages

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS plan_type        text        NOT NULL DEFAULT 'platform',
  ADD COLUMN IF NOT EXISTS is_featured      boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_enterprise    boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS setup_fee_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS features         jsonb,
  ADD COLUMN IF NOT EXISTS cta_text         text,
  ADD COLUMN IF NOT EXISTS cta_email        text,
  ADD COLUMN IF NOT EXISTS sort_order       integer     NOT NULL DEFAULT 0;

-- Valid values: 'platform' | 'qbo_r365'
ALTER TABLE public.plans
  ADD CONSTRAINT plans_plan_type_check CHECK (plan_type IN ('platform', 'qbo_r365'));

COMMENT ON COLUMN public.plans.plan_type IS 'Discriminator: platform = SaaS subscription plans, qbo_r365 = QBO↔R365 integration landing plans';
COMMENT ON COLUMN public.plans.is_featured IS 'If true, renders as the highlighted/dark featured card on integration landing';
COMMENT ON COLUMN public.plans.is_enterprise IS 'If true, hides numeric price and shows CTA-only card (dashed border)';
COMMENT ON COLUMN public.plans.setup_fee_amount IS 'One-time setup fee in the same currency as price_amount. NULL = no setup fee shown';
COMMENT ON COLUMN public.plans.features IS 'JSONB array of feature objects: [{text, highlight, everything, annual_only}]';
COMMENT ON COLUMN public.plans.cta_text IS 'Label for the call-to-action button on this plan card';
COMMENT ON COLUMN public.plans.cta_email IS 'mailto address for the CTA button (used when no checkout URL is configured)';
COMMENT ON COLUMN public.plans.sort_order IS 'Display order on landing page (ascending). Defaults to 0.';

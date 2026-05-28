-- Add integration_plan_type to module_catalog
-- Modules with this field use tiered integration plans instead of a single addon_stripe_price_id.
ALTER TABLE public.module_catalog
  ADD COLUMN IF NOT EXISTS integration_plan_type text NULL;

-- Link qbo_r365 module to its plan type
UPDATE public.module_catalog
  SET integration_plan_type = 'qbo_r365'
  WHERE code = 'qbo_r365';

-- Add integration_plan_id to organization_addons for tier tracking
-- Tracks which specific tier (Connect/Grow/Scale) an org is subscribed to.
ALTER TABLE public.organization_addons
  ADD COLUMN IF NOT EXISTS integration_plan_id uuid NULL
    REFERENCES public.plans(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';

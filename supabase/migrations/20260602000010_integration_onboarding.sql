-- Onboarding state for QBO integration companies.
-- integration_vendor_profile: company info collected during onboarding.
-- integration_onboarding_completed_at: NULL = onboarding pending, set = done.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS integration_vendor_profile        JSONB,
  ADD COLUMN IF NOT EXISTS integration_onboarding_completed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.organizations.integration_vendor_profile IS
  'Vendor contact info collected during QBO onboarding. Schema: {company,contactName,email,phone,address,website}';
COMMENT ON COLUMN public.organizations.integration_onboarding_completed_at IS
  'Set when the company completes the QBO integration onboarding wizard. NULL = onboarding not yet done.';

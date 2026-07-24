ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS integration_onboarding_skipped_at TIMESTAMPTZ;

COMMENT ON COLUMN public.organizations.integration_onboarding_skipped_at IS
  'When set, the integration onboarding was dismissed without satisfying every required step.';

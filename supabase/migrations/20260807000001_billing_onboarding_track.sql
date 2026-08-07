ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS billing_onboarding_track text NOT NULL DEFAULT 'platform';

DO $$
BEGIN
  ALTER TABLE public.organizations
    ADD CONSTRAINT organizations_billing_onboarding_track_check
    CHECK (billing_onboarding_track IN ('platform', 'integration'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

UPDATE public.organizations
SET billing_onboarding_track = 'integration'
WHERE integration_plan_id IS NOT NULL
  AND plan_id IS NULL;

COMMENT ON COLUMN public.organizations.billing_onboarding_track IS
  'Product family selected before billing activation; survives redirects, MFA, and refreshes.';

NOTIFY pgrst, 'reload schema';

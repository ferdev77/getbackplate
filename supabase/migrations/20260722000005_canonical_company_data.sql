ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT;

COMMENT ON COLUMN public.organization_settings.contact_name IS
  'Primary company contact, populated by onboarding or company settings.';
COMMENT ON COLUMN public.organization_settings.address IS
  'Primary company address, populated by onboarding or company settings.';

INSERT INTO public.organization_settings (
  organization_id,
  contact_name,
  support_email,
  support_phone,
  address,
  website_url
)
SELECT
  organizations.id,
  NULLIF(BTRIM(organizations.integration_vendor_profile ->> 'contactName'), ''),
  NULLIF(BTRIM(organizations.integration_vendor_profile ->> 'email'), ''),
  NULLIF(BTRIM(organizations.integration_vendor_profile ->> 'phone'), ''),
  NULLIF(BTRIM(organizations.integration_vendor_profile ->> 'address'), ''),
  NULLIF(BTRIM(organizations.integration_vendor_profile ->> 'website'), '')
FROM public.organizations
WHERE organizations.integration_vendor_profile IS NOT NULL
ON CONFLICT (organization_id) DO UPDATE SET
  contact_name = COALESCE(NULLIF(BTRIM(public.organization_settings.contact_name), ''), EXCLUDED.contact_name),
  support_email = COALESCE(NULLIF(BTRIM(public.organization_settings.support_email), ''), EXCLUDED.support_email),
  support_phone = COALESCE(NULLIF(BTRIM(public.organization_settings.support_phone), ''), EXCLUDED.support_phone),
  address = COALESCE(NULLIF(BTRIM(public.organization_settings.address), ''), EXCLUDED.address),
  website_url = COALESCE(NULLIF(BTRIM(public.organization_settings.website_url), ''), EXCLUDED.website_url);

UPDATE public.organizations
SET integration_vendor_profile = NULL
WHERE integration_vendor_profile IS NOT NULL;

COMMENT ON COLUMN public.organizations.integration_vendor_profile IS
  'Deprecated. Company contact data is stored in public.organization_settings.';

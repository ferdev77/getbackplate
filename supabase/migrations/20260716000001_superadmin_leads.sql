-- Centralized intake for sales leads created by public and referral flows.
CREATE TABLE IF NOT EXISTS public.superadmin_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('seat_request', 'public_referral', 'private_referral')),
  source_record_id uuid,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'won', 'lost')),
  contact_name text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text,
  company_name text,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

-- PostgreSQL unique indexes allow multiple NULL values, so seat requests remain
-- repeatable while referral rows are idempotent by their source record.
CREATE UNIQUE INDEX IF NOT EXISTS superadmin_leads_source_record_id_key
  ON public.superadmin_leads (source, source_record_id);

CREATE INDEX IF NOT EXISTS superadmin_leads_created_at_idx
  ON public.superadmin_leads (created_at DESC);

CREATE OR REPLACE FUNCTION public.set_superadmin_leads_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_superadmin_leads_updated_at ON public.superadmin_leads;
CREATE TRIGGER trg_superadmin_leads_updated_at
  BEFORE UPDATE ON public.superadmin_leads
  FOR EACH ROW EXECUTE FUNCTION public.set_superadmin_leads_updated_at();

ALTER TABLE public.superadmin_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS superadmin_leads_superadmin_select ON public.superadmin_leads;
CREATE POLICY superadmin_leads_superadmin_select
  ON public.superadmin_leads
  FOR SELECT
  TO authenticated
  USING (public.is_superadmin());

DROP POLICY IF EXISTS superadmin_leads_superadmin_update ON public.superadmin_leads;
CREATE POLICY superadmin_leads_superadmin_update
  ON public.superadmin_leads
  FOR UPDATE
  TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

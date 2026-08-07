CREATE TABLE IF NOT EXISTS public.development_ledger_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stable_key text UNIQUE,
  occurred_on date NOT NULL,
  plan_scope text NOT NULL CHECK (plan_scope IN ('integration', 'platform', 'cross')),
  work_type text NOT NULL CHECK (work_type IN ('new', 'fix', 'security', 'legal', 'docs', 'review')),
  section_code text NOT NULL,
  section_title text NOT NULL,
  title text NOT NULL,
  rationale text,
  technical_detail text,
  billing_status text NOT NULL DEFAULT 'unpriced'
    CHECK (billing_status IN ('unpriced', 'to_invoice', 'previously_invoiced', 'included')),
  amount_cents integer CHECK (amount_cents IS NULL OR amount_cents >= 0),
  prior_invoice_label text,
  sort_order integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS development_ledger_items_date_idx
  ON public.development_ledger_items (occurred_on DESC, sort_order, id);
CREATE INDEX IF NOT EXISTS development_ledger_items_billing_idx
  ON public.development_ledger_items (billing_status, occurred_on DESC)
  WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS public.development_ledger_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  date_from date NOT NULL,
  date_to date NOT NULL,
  template_version integer NOT NULL DEFAULT 1,
  item_count integer NOT NULL CHECK (item_count >= 0),
  total_cents integer NOT NULL CHECK (total_cents >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  snapshot jsonb NOT NULL,
  html_document text NOT NULL,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (date_to >= date_from)
);

CREATE INDEX IF NOT EXISTS development_ledger_reports_period_idx
  ON public.development_ledger_reports (date_from DESC, date_to DESC, generated_at DESC);

ALTER TABLE public.development_ledger_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.development_ledger_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS development_ledger_items_superadmin_all ON public.development_ledger_items;
CREATE POLICY development_ledger_items_superadmin_all
  ON public.development_ledger_items
  FOR ALL TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS development_ledger_reports_superadmin_select ON public.development_ledger_reports;
CREATE POLICY development_ledger_reports_superadmin_select
  ON public.development_ledger_reports
  FOR SELECT TO authenticated
  USING (public.is_superadmin());

DROP POLICY IF EXISTS development_ledger_reports_superadmin_insert ON public.development_ledger_reports;
CREATE POLICY development_ledger_reports_superadmin_insert
  ON public.development_ledger_reports
  FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin() AND generated_by = auth.uid());

DROP TRIGGER IF EXISTS trg_development_ledger_items_updated_at ON public.development_ledger_items;
CREATE TRIGGER trg_development_ledger_items_updated_at
  BEFORE UPDATE ON public.development_ledger_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.prevent_development_report_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'development reports are immutable'
    USING errcode = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_development_report_mutation ON public.development_ledger_reports;
CREATE TRIGGER trg_prevent_development_report_mutation
  BEFORE UPDATE OR DELETE ON public.development_ledger_reports
  FOR EACH ROW EXECUTE FUNCTION public.prevent_development_report_mutation();

COMMENT ON TABLE public.development_ledger_items IS
  'Mutable superadmin ledger of delivered development work and billing classification.';
COMMENT ON TABLE public.development_ledger_reports IS
  'Immutable snapshots and final HTML documents generated from the development ledger.';

NOTIFY pgrst, 'reload schema';

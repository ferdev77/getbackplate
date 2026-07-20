-- Intuit readiness: bounded operational retention, durable billing evidence,
-- and a public support/privacy request queue.

CREATE TABLE IF NOT EXISTS public.billing_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  record_type text NOT NULL CHECK (record_type IN ('stripe_invoice', 'manual_payment')),
  source_event_id text NOT NULL UNIQUE,
  stripe_invoice_id text,
  stripe_payment_intent_id text,
  stripe_checkout_session_id text,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  currency text NOT NULL,
  paid_at timestamptz NOT NULL,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_records_org_paid_at_idx
  ON public.billing_records (organization_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS billing_records_paid_at_idx
  ON public.billing_records (paid_at);

ALTER TABLE public.billing_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS billing_records_superadmin_select ON public.billing_records;
CREATE POLICY billing_records_superadmin_select ON public.billing_records
  FOR SELECT TO authenticated USING (public.is_superadmin());
DROP POLICY IF EXISTS billing_records_service_all ON public.billing_records;
CREATE POLICY billing_records_service_all ON public.billing_records
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.legal_acceptance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  stripe_checkout_session_id text NOT NULL UNIQUE,
  customer_email text,
  legal_version text,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS legal_acceptance_records_accepted_at_idx
  ON public.legal_acceptance_records (accepted_at);

CREATE INDEX IF NOT EXISTS qbo_unified_invoices_retention_idx
  ON public.qbo_unified_invoices (created_at);
CREATE INDEX IF NOT EXISTS qbo_unified_invoices_fiscal_retention_idx
  ON public.qbo_unified_invoices (txn_date, created_at);
CREATE INDEX IF NOT EXISTS integration_runs_retention_idx
  ON public.integration_runs (started_at);
CREATE INDEX IF NOT EXISTS integration_audit_logs_retention_idx
  ON public.integration_audit_logs (created_at);
CREATE INDEX IF NOT EXISTS qbo_weekly_invoice_report_runs_retention_idx
  ON public.qbo_weekly_invoice_report_runs (sent_at);
CREATE INDEX IF NOT EXISTS qbo_owner_weekly_report_runs_retention_idx
  ON public.qbo_owner_weekly_report_runs (sent_at);

ALTER TABLE public.legal_acceptance_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS legal_acceptance_records_superadmin_select ON public.legal_acceptance_records;
CREATE POLICY legal_acceptance_records_superadmin_select ON public.legal_acceptance_records
  FOR SELECT TO authenticated USING (public.is_superadmin());
DROP POLICY IF EXISTS legal_acceptance_records_service_all ON public.legal_acceptance_records;
CREATE POLICY legal_acceptance_records_service_all ON public.legal_acceptance_records
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.support_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type text NOT NULL CHECK (request_type IN ('support', 'access', 'correction', 'export', 'deletion')),
  requester_name text NOT NULL,
  requester_email text NOT NULL,
  company_name text,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  details text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'verifying', 'in_progress', 'resolved', 'rejected')),
  visitor_ip_hash text,
  user_agent text,
  verified_at timestamptz,
  resolved_at timestamptz,
  resolution_notes text,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledgement_sent_at timestamptz,
  internal_notified_at timestamptz,
  notification_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_requests ADD COLUMN IF NOT EXISTS acknowledgement_sent_at timestamptz;
ALTER TABLE public.support_requests ADD COLUMN IF NOT EXISTS internal_notified_at timestamptz;
ALTER TABLE public.support_requests ADD COLUMN IF NOT EXISTS notification_error text;

CREATE INDEX IF NOT EXISTS support_requests_status_created_at_idx
  ON public.support_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS support_requests_email_created_at_idx
  ON public.support_requests (requester_email, created_at DESC);
CREATE INDEX IF NOT EXISTS support_requests_ip_created_at_idx
  ON public.support_requests (visitor_ip_hash, created_at DESC);

ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS support_requests_superadmin_all ON public.support_requests;
CREATE POLICY support_requests_superadmin_all ON public.support_requests
  FOR ALL TO authenticated
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());
DROP POLICY IF EXISTS support_requests_service_all ON public.support_requests;
CREATE POLICY support_requests_service_all ON public.support_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_support_requests_updated_at ON public.support_requests;
CREATE TRIGGER trg_support_requests_updated_at
  BEFORE UPDATE ON public.support_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Fiscal summaries survive tenant deletion without retaining an active tenant link.
ALTER TABLE public.qbo_unified_invoices ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE public.qbo_unified_invoices
  DROP CONSTRAINT IF EXISTS qbo_unified_invoices_organization_id_fkey;
ALTER TABLE public.qbo_unified_invoices
  ADD CONSTRAINT qbo_unified_invoices_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.purge_expired_intuit_data(
  p_operational_cutoff timestamptz,
  p_fiscal_cutoff timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  counts jsonb := '{}'::jsonb;
  affected integer;
BEGIN
  UPDATE public.qbo_unified_invoices
  SET raw_entity = NULL
  WHERE created_at < p_operational_cutoff AND raw_entity IS NOT NULL;
  GET DIAGNOSTICS affected = ROW_COUNT;
  counts := counts || jsonb_build_object('invoice_raw_payloads_cleared', affected);

  DELETE FROM public.qbo_webhook_events WHERE received_at < p_operational_cutoff;
  GET DIAGNOSTICS affected = ROW_COUNT;
  counts := counts || jsonb_build_object('webhook_events_deleted', affected);

  -- Run items, outbox metadata, and run-linked audit rows cascade with runs.
  DELETE FROM public.integration_runs WHERE started_at < p_operational_cutoff;
  GET DIAGNOSTICS affected = ROW_COUNT;
  counts := counts || jsonb_build_object('integration_runs_deleted', affected);

  DELETE FROM public.integration_audit_logs WHERE created_at < p_operational_cutoff;
  GET DIAGNOSTICS affected = ROW_COUNT;
  counts := counts || jsonb_build_object('integration_audit_logs_deleted', affected);

  DELETE FROM public.qbo_recovery_run_log WHERE ran_at < p_operational_cutoff;
  GET DIAGNOSTICS affected = ROW_COUNT;
  counts := counts || jsonb_build_object('recovery_logs_deleted', affected);

  DELETE FROM public.qbo_weekly_invoice_report_runs WHERE sent_at < p_operational_cutoff;
  GET DIAGNOSTICS affected = ROW_COUNT;
  counts := counts || jsonb_build_object('weekly_report_runs_deleted', affected);

  DELETE FROM public.qbo_owner_weekly_report_runs WHERE sent_at < p_operational_cutoff;
  GET DIAGNOSTICS affected = ROW_COUNT;
  counts := counts || jsonb_build_object('owner_report_runs_deleted', affected);

  -- Fiscal invoice summaries and durable billing/acceptance evidence live for 7 years.
  DELETE FROM public.qbo_unified_invoices
  WHERE COALESCE(txn_date::timestamptz, created_at) < p_fiscal_cutoff;
  GET DIAGNOSTICS affected = ROW_COUNT;
  counts := counts || jsonb_build_object('invoice_summaries_deleted', affected);

  DELETE FROM public.billing_records WHERE paid_at < p_fiscal_cutoff;
  GET DIAGNOSTICS affected = ROW_COUNT;
  counts := counts || jsonb_build_object('billing_records_deleted', affected);

  DELETE FROM public.legal_acceptance_records WHERE accepted_at < p_fiscal_cutoff;
  GET DIAGNOSTICS affected = ROW_COUNT;
  counts := counts || jsonb_build_object('legal_acceptances_deleted', affected);

  DELETE FROM public.manual_payment_orders
  WHERE (status = 'paid' AND paid_at < p_fiscal_cutoff)
     OR (status <> 'paid' AND created_at < p_operational_cutoff);
  GET DIAGNOSTICS affected = ROW_COUNT;
  counts := counts || jsonb_build_object('manual_payment_orders_deleted', affected);

  DELETE FROM public.manual_subscription_orders
  WHERE (status IN ('completed', 'upgraded') AND completed_at < p_fiscal_cutoff)
     OR (status NOT IN ('completed', 'upgraded') AND created_at < p_operational_cutoff);
  GET DIAGNOSTICS affected = ROW_COUNT;
  counts := counts || jsonb_build_object('manual_subscription_orders_deleted', affected);

  DELETE FROM public.r365_connection_purchases
  WHERE (status = 'paid_applied' AND applied_at < p_fiscal_cutoff)
     OR (status <> 'paid_applied' AND created_at < p_operational_cutoff);
  GET DIAGNOSTICS affected = ROW_COUNT;
  counts := counts || jsonb_build_object('connection_purchases_deleted', affected);

  SELECT COALESCE(sum(value::integer), 0)::integer
  INTO affected
  FROM jsonb_each_text(counts);

  INSERT INTO public.system_maintenance_logs (task, status, records_affected, cutoff_at)
  VALUES ('intuit_data_retention', 'success', affected, p_operational_cutoff);

  DELETE FROM public.system_maintenance_logs
  WHERE ran_at < p_operational_cutoff;

  RETURN counts;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_intuit_data(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_expired_intuit_data(timestamptz, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.purge_expired_intuit_data(timestamptz, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_intuit_data(timestamptz, timestamptz) TO service_role;

NOTIFY pgrst, 'reload schema';

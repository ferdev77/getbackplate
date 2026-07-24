-- Durable OAuth, disconnect, webhook, and reconciliation state for Intuit/QBO.

ALTER TABLE public.integration_connections
  ADD COLUMN IF NOT EXISTS qbo_authorization_version bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qbo_disconnect_state text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS qbo_disconnect_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS qbo_disconnect_next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS qbo_disconnect_last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS qbo_disconnect_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qbo_disconnect_last_error_code text,
  ADD COLUMN IF NOT EXISTS qbo_oauth_claim_id uuid,
  ADD COLUMN IF NOT EXISTS qbo_oauth_claimed_at timestamptz;

UPDATE public.integration_connections
SET qbo_authorization_version = 1
WHERE provider = 'quickbooks_online'
  AND status = 'connected'
  AND qbo_authorization_version = 0;

DO $$
BEGIN
  ALTER TABLE public.integration_connections
    ADD CONSTRAINT integration_connections_qbo_disconnect_state_check
    CHECK (qbo_disconnect_state IN ('none', 'portal_pending', 'app_pending', 'portal_review', 'app_review'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.integration_connections
    ADD CONSTRAINT integration_connections_qbo_disconnect_attempts_check
    CHECK (qbo_disconnect_attempts >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS integration_connections_qbo_disconnect_due_idx
  ON public.integration_connections (qbo_disconnect_next_attempt_at)
  WHERE provider = 'quickbooks_online'
    AND qbo_disconnect_state IN ('portal_pending', 'app_pending');

CREATE TABLE IF NOT EXISTS public.qbo_oauth_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_hash text NOT NULL UNIQUE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  return_origin text NOT NULL,
  status text NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'processing', 'completed', 'failed')),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT qbo_oauth_attempts_state_hash_check CHECK (state_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT qbo_oauth_attempts_return_origin_check CHECK (return_origin ~ '^https?://[^/]+$')
);

CREATE INDEX IF NOT EXISTS qbo_oauth_attempts_expires_idx
  ON public.qbo_oauth_attempts (expires_at);

DROP TRIGGER IF EXISTS trg_qbo_oauth_attempts_updated_at ON public.qbo_oauth_attempts;
CREATE TRIGGER trg_qbo_oauth_attempts_updated_at
  BEFORE UPDATE ON public.qbo_oauth_attempts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.qbo_oauth_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.qbo_oauth_attempts FROM anon, authenticated;
GRANT ALL ON public.qbo_oauth_attempts TO service_role;
DROP POLICY IF EXISTS qbo_oauth_attempts_service_all ON public.qbo_oauth_attempts;
CREATE POLICY qbo_oauth_attempts_service_all ON public.qbo_oauth_attempts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.qbo_webhook_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  body_sha256 text NOT NULL CHECK (body_sha256 ~ '^[0-9a-f]{64}$'),
  raw_body_base64 text NOT NULL,
  safe_headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature_valid boolean NOT NULL DEFAULT true CHECK (signature_valid = true),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'processed', 'partially_processed', 'malformed', 'unsupported', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  normalized_event_count integer NOT NULL DEFAULT 0 CHECK (normalized_event_count >= 0),
  ignored_entry_count integer NOT NULL DEFAULT 0 CHECK (ignored_entry_count >= 0),
  claimed_at timestamptz,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS qbo_webhook_receipts_status_received_idx
  ON public.qbo_webhook_receipts (status, received_at);
CREATE INDEX IF NOT EXISTS qbo_webhook_receipts_claimed_idx
  ON public.qbo_webhook_receipts (claimed_at)
  WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS qbo_webhook_receipts_body_hash_idx
  ON public.qbo_webhook_receipts (body_sha256, received_at DESC);

DROP TRIGGER IF EXISTS trg_qbo_webhook_receipts_updated_at ON public.qbo_webhook_receipts;
CREATE TRIGGER trg_qbo_webhook_receipts_updated_at
  BEFORE UPDATE ON public.qbo_webhook_receipts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.qbo_webhook_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.qbo_webhook_receipts FROM anon, authenticated;
GRANT ALL ON public.qbo_webhook_receipts TO service_role;
GRANT SELECT ON public.qbo_webhook_receipts TO authenticated;
DROP POLICY IF EXISTS qbo_webhook_receipts_superadmin_select ON public.qbo_webhook_receipts;
CREATE POLICY qbo_webhook_receipts_superadmin_select ON public.qbo_webhook_receipts
  FOR SELECT TO authenticated USING (public.is_superadmin());
DROP POLICY IF EXISTS qbo_webhook_receipts_service_all ON public.qbo_webhook_receipts;
CREATE POLICY qbo_webhook_receipts_service_all ON public.qbo_webhook_receipts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.qbo_cdc_reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  reconciliation_date date NOT NULL,
  window_from timestamptz NOT NULL,
  window_to timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  discovered integer NOT NULL DEFAULT 0 CHECK (discovered >= 0),
  eligible integer NOT NULL DEFAULT 0 CHECK (eligible >= 0),
  enqueued integer NOT NULL DEFAULT 0 CHECK (enqueued >= 0),
  skipped_existing integer NOT NULL DEFAULT 0 CHECK (skipped_existing >= 0),
  claimed_at timestamptz,
  finished_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, reconciliation_date),
  CONSTRAINT qbo_cdc_reconciliation_window_check CHECK (window_from <= window_to)
);

CREATE INDEX IF NOT EXISTS qbo_cdc_reconciliation_status_idx
  ON public.qbo_cdc_reconciliation_runs (status, created_at);
CREATE INDEX IF NOT EXISTS qbo_cdc_reconciliation_org_date_idx
  ON public.qbo_cdc_reconciliation_runs (organization_id, reconciliation_date DESC);

DROP TRIGGER IF EXISTS trg_qbo_cdc_reconciliation_updated_at ON public.qbo_cdc_reconciliation_runs;
CREATE TRIGGER trg_qbo_cdc_reconciliation_updated_at
  BEFORE UPDATE ON public.qbo_cdc_reconciliation_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.qbo_cdc_reconciliation_runs ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.qbo_cdc_reconciliation_runs FROM anon, authenticated;
GRANT ALL ON public.qbo_cdc_reconciliation_runs TO service_role;
GRANT SELECT ON public.qbo_cdc_reconciliation_runs TO authenticated;
DROP POLICY IF EXISTS qbo_cdc_reconciliation_company_admin_select ON public.qbo_cdc_reconciliation_runs;
CREATE POLICY qbo_cdc_reconciliation_company_admin_select ON public.qbo_cdc_reconciliation_runs
  FOR SELECT TO authenticated USING (
    organization_id IN (
      SELECT m.organization_id
      FROM public.memberships m
      JOIN public.roles r ON r.id = m.role_id
      WHERE m.user_id = auth.uid() AND m.status = 'active' AND r.code = 'company_admin'
    )
  );
DROP POLICY IF EXISTS qbo_cdc_reconciliation_service_all ON public.qbo_cdc_reconciliation_runs;
CREATE POLICY qbo_cdc_reconciliation_service_all ON public.qbo_cdc_reconciliation_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.qbo_webhook_events
  DROP CONSTRAINT IF EXISTS qbo_webhook_events_status_check;
UPDATE public.qbo_webhook_events
SET status = 'processed'
WHERE status = 'imported_manual' AND imported_by IS NULL;
ALTER TABLE public.qbo_webhook_events
  ADD CONSTRAINT qbo_webhook_events_status_check
  CHECK (status IN ('captured', 'processed', 'imported_manual', 'ignored', 'failed'));
UPDATE public.qbo_webhook_events
SET raw_headers = raw_headers - 'intuitSignature'
WHERE raw_headers ? 'intuitSignature';

ALTER TABLE public.qbo_unified_invoices
  DROP CONSTRAINT IF EXISTS qbo_unified_invoices_import_source_check;
ALTER TABLE public.qbo_unified_invoices
  ADD CONSTRAINT qbo_unified_invoices_import_source_check
  CHECK (import_source IN ('sync', 'webhook', 'manual', 'reconciliation'));

-- Operational records are tenant-readable but server-owned.
DROP POLICY IF EXISTS integration_connections_company_admin_all ON public.integration_connections;
DROP POLICY IF EXISTS integration_connections_company_admin_select ON public.integration_connections;
CREATE POLICY integration_connections_company_admin_select ON public.integration_connections
  FOR SELECT TO authenticated USING (
    organization_id IN (
      SELECT m.organization_id FROM public.memberships m
      JOIN public.roles r ON r.id = m.role_id
      WHERE m.user_id = auth.uid() AND m.status = 'active' AND r.code = 'company_admin'
    )
  );

DROP POLICY IF EXISTS qbo_webhook_events_company_admin_all ON public.qbo_webhook_events;
DROP POLICY IF EXISTS qbo_webhook_events_company_admin_select ON public.qbo_webhook_events;
CREATE POLICY qbo_webhook_events_company_admin_select ON public.qbo_webhook_events
  FOR SELECT TO authenticated USING (
    organization_id IN (
      SELECT m.organization_id FROM public.memberships m
      JOIN public.roles r ON r.id = m.role_id
      WHERE m.user_id = auth.uid() AND m.status = 'active' AND r.code = 'company_admin'
    )
  );

DROP POLICY IF EXISTS qbo_unified_invoices_company_admin_all ON public.qbo_unified_invoices;
DROP POLICY IF EXISTS qbo_unified_invoices_company_admin_select ON public.qbo_unified_invoices;
CREATE POLICY qbo_unified_invoices_company_admin_select ON public.qbo_unified_invoices
  FOR SELECT TO authenticated USING (
    organization_id IN (
      SELECT m.organization_id FROM public.memberships m
      JOIN public.roles r ON r.id = m.role_id
      WHERE m.user_id = auth.uid() AND m.status = 'active' AND r.code = 'company_admin'
    )
  );

DROP POLICY IF EXISTS integration_runs_company_admin_all ON public.integration_runs;
DROP POLICY IF EXISTS integration_runs_company_admin_select ON public.integration_runs;
CREATE POLICY integration_runs_company_admin_select ON public.integration_runs
  FOR SELECT TO authenticated USING (
    organization_id IN (
      SELECT m.organization_id FROM public.memberships m
      JOIN public.roles r ON r.id = m.role_id
      WHERE m.user_id = auth.uid() AND m.status = 'active' AND r.code = 'company_admin'
    )
  );

DROP POLICY IF EXISTS integration_run_items_company_admin_all ON public.integration_run_items;
DROP POLICY IF EXISTS integration_run_items_company_admin_select ON public.integration_run_items;
CREATE POLICY integration_run_items_company_admin_select ON public.integration_run_items
  FOR SELECT TO authenticated USING (
    organization_id IN (
      SELECT m.organization_id FROM public.memberships m
      JOIN public.roles r ON r.id = m.role_id
      WHERE m.user_id = auth.uid() AND m.status = 'active' AND r.code = 'company_admin'
    )
  );

DROP POLICY IF EXISTS integration_outbox_files_company_admin_all ON public.integration_outbox_files;
DROP POLICY IF EXISTS integration_outbox_files_company_admin_select ON public.integration_outbox_files;
CREATE POLICY integration_outbox_files_company_admin_select ON public.integration_outbox_files
  FOR SELECT TO authenticated USING (
    organization_id IN (
      SELECT m.organization_id FROM public.memberships m
      JOIN public.roles r ON r.id = m.role_id
      WHERE m.user_id = auth.uid() AND m.status = 'active' AND r.code = 'company_admin'
    )
  );

DROP POLICY IF EXISTS integration_audit_logs_company_admin_all ON public.integration_audit_logs;
DROP POLICY IF EXISTS integration_audit_logs_company_admin_select ON public.integration_audit_logs;
CREATE POLICY integration_audit_logs_company_admin_select ON public.integration_audit_logs
  FOR SELECT TO authenticated USING (
    organization_id IN (
      SELECT m.organization_id FROM public.memberships m
      JOIN public.roles r ON r.id = m.role_id
      WHERE m.user_id = auth.uid() AND m.status = 'active' AND r.code = 'company_admin'
    )
  );

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.integration_connections FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.qbo_webhook_events FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.qbo_unified_invoices FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.integration_runs FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.integration_run_items FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.integration_outbox_files FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.integration_audit_logs FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';

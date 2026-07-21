-- Per-response Intuit trace IDs for support diagnostics. This table stores
-- transport metadata only: never request bodies, response bodies, or tokens.

CREATE TABLE IF NOT EXISTS public.intuit_api_response_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  run_id uuid REFERENCES public.integration_runs(id) ON DELETE SET NULL,
  realm_id_hash text,
  operation text NOT NULL,
  endpoint text NOT NULL,
  http_method text NOT NULL,
  status_code integer NOT NULL CHECK (status_code BETWEEN 100 AND 599),
  is_success boolean NOT NULL,
  intuit_tid text,
  duration_ms integer NOT NULL CHECK (duration_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE public.intuit_api_response_logs
    ADD CONSTRAINT intuit_api_response_logs_realm_hash_check
    CHECK (realm_id_hash IS NULL OR realm_id_hash ~ '^[0-9a-f]{64}$');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS intuit_api_response_logs_created_at_idx
  ON public.intuit_api_response_logs (created_at);
CREATE INDEX IF NOT EXISTS intuit_api_response_logs_org_created_idx
  ON public.intuit_api_response_logs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS intuit_api_response_logs_tid_idx
  ON public.intuit_api_response_logs (intuit_tid)
  WHERE intuit_tid IS NOT NULL;
CREATE INDEX IF NOT EXISTS intuit_api_response_logs_realm_created_idx
  ON public.intuit_api_response_logs (realm_id_hash, created_at DESC)
  WHERE realm_id_hash IS NOT NULL;

ALTER TABLE public.intuit_api_response_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS intuit_api_response_logs_superadmin_select ON public.intuit_api_response_logs;
CREATE POLICY intuit_api_response_logs_superadmin_select ON public.intuit_api_response_logs
  FOR SELECT TO authenticated USING (public.is_superadmin());
DROP POLICY IF EXISTS intuit_api_response_logs_service_all ON public.intuit_api_response_logs;
CREATE POLICY intuit_api_response_logs_service_all ON public.intuit_api_response_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

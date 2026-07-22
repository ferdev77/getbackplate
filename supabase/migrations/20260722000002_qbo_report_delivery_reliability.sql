-- Recoverable report-run claims and transactional preference abuse protection.

ALTER TABLE public.qbo_weekly_invoice_report_runs
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_error text;

UPDATE public.qbo_weekly_invoice_report_runs
SET completed_at = COALESCE(completed_at, sent_at)
WHERE status = 'completed';

DO $$ BEGIN
  ALTER TABLE public.qbo_weekly_invoice_report_runs
    ADD CONSTRAINT qbo_report_runs_status_ck
    CHECK (status IN ('processing', 'completed', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.qbo_report_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.qbo_weekly_invoice_report_runs(id) ON DELETE CASCADE,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  recipient_email text NOT NULL,
  status text NOT NULL DEFAULT 'processing',
  claimed_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 1,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, target_type, target_id, recipient_email)
);

DO $$ BEGIN
  ALTER TABLE public.qbo_report_deliveries
    ADD CONSTRAINT qbo_report_deliveries_target_type_ck
    CHECK (target_type IN ('organization', 'branch'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.qbo_report_deliveries
    ADD CONSTRAINT qbo_report_deliveries_status_ck
    CHECK (status IN ('processing', 'sent', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS qbo_report_deliveries_run_idx
  ON public.qbo_report_deliveries (run_id, status);

ALTER TABLE public.qbo_report_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS qbo_report_deliveries_service_all
  ON public.qbo_report_deliveries;
CREATE POLICY qbo_report_deliveries_service_all
  ON public.qbo_report_deliveries
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DO $$ BEGIN
  ALTER TABLE public.qbo_weekly_invoice_report_runs
    ADD CONSTRAINT qbo_report_runs_attempt_count_ck
    CHECK (attempt_count > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.validate_qbo_report_subscription_target()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.target_type = 'branch' AND NOT EXISTS (
    SELECT 1
    FROM public.qbo_r365_sync_config_customers customer
    WHERE customer.id = NEW.target_id
      AND customer.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'Invalid branch report target';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_qbo_report_subscription_target
  ON public.qbo_report_subscriptions;
CREATE TRIGGER trg_validate_qbo_report_subscription_target
  BEFORE INSERT OR UPDATE OF organization_id, target_type, target_id
  ON public.qbo_report_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.validate_qbo_report_subscription_target();

CREATE OR REPLACE FUNCTION public.update_qbo_report_preference(
  p_subscription_id uuid,
  p_frequency text,
  p_source text DEFAULT 'report_service',
  p_expected_token_nonce uuid DEFAULT NULL
)
RETURNS public.qbo_report_subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  previous_subscription public.qbo_report_subscriptions%ROWTYPE;
  updated_subscription public.qbo_report_subscriptions%ROWTYPE;
BEGIN
  IF p_frequency NOT IN ('weekly', 'monthly', 'off') THEN
    RAISE EXCEPTION 'Invalid report frequency';
  END IF;
  IF p_source NOT IN ('public_link', 'report_service', 'superadmin') THEN
    RAISE EXCEPTION 'Invalid preference source';
  END IF;

  SELECT * INTO previous_subscription
  FROM public.qbo_report_subscriptions
  WHERE id = p_subscription_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report subscription not found';
  END IF;
  IF p_expected_token_nonce IS NOT NULL
     AND previous_subscription.token_nonce <> p_expected_token_nonce THEN
    RAISE EXCEPTION 'Report subscription token is invalid';
  END IF;
  IF previous_subscription.frequency = p_frequency THEN
    RETURN previous_subscription;
  END IF;
  IF p_source = 'public_link' AND (
    SELECT count(*)
    FROM public.qbo_report_preference_events
    WHERE subscription_id = p_subscription_id
      AND created_at >= now() - interval '1 minute'
  ) >= 5 THEN
    RAISE EXCEPTION 'Too many report preference changes';
  END IF;

  UPDATE public.qbo_report_subscriptions
  SET frequency = p_frequency
  WHERE id = p_subscription_id
  RETURNING * INTO updated_subscription;

  INSERT INTO public.qbo_report_preference_events (
    subscription_id,
    previous_frequency,
    frequency,
    source
  ) VALUES (
    p_subscription_id,
    previous_subscription.frequency,
    updated_subscription.frequency,
    p_source
  );

  RETURN updated_subscription;
END;
$$;

REVOKE ALL ON FUNCTION public.update_qbo_report_preference(uuid, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_qbo_report_preference(uuid, text, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.update_qbo_report_preference(uuid, text, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.update_qbo_report_preference(uuid, text, text, uuid) TO service_role;

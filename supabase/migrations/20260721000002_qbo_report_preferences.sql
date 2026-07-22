-- Durable cadence preferences for QBO report recipients and immutable change history.

ALTER TABLE public.qbo_weekly_invoice_report_runs
  ADD COLUMN IF NOT EXISTS report_kind text NOT NULL DEFAULT 'weekly';

-- Existing monthly runs cover substantially more than one week.
UPDATE public.qbo_weekly_invoice_report_runs
SET report_kind = 'monthly'
WHERE period_end - period_start > 8;

DO $$ BEGIN
  ALTER TABLE public.qbo_weekly_invoice_report_runs
    ADD CONSTRAINT qbo_weekly_invoice_report_runs_kind_ck
    CHECK (report_kind IN ('weekly', 'monthly'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.qbo_weekly_invoice_report_runs
  DROP CONSTRAINT IF EXISTS qbo_weekly_invoice_report_runs_organization_id_period_start_key;

CREATE UNIQUE INDEX IF NOT EXISTS qbo_report_runs_kind_period_uidx
  ON public.qbo_weekly_invoice_report_runs (
    organization_id,
    report_kind,
    period_start,
    period_end
  );

CREATE TABLE IF NOT EXISTS public.qbo_report_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  recipient_email text NOT NULL,
  frequency text NOT NULL DEFAULT 'weekly',
  token_nonce uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.qbo_report_subscriptions
    ADD CONSTRAINT qbo_report_subscriptions_target_type_ck
    CHECK (target_type IN ('organization', 'branch'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.qbo_report_subscriptions
    ADD CONSTRAINT qbo_report_subscriptions_frequency_ck
    CHECK (frequency IN ('weekly', 'monthly', 'off'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.qbo_report_subscriptions
    ADD CONSTRAINT qbo_report_subscriptions_normalized_email_ck
    CHECK (recipient_email = lower(btrim(recipient_email)) AND recipient_email <> '');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.qbo_report_subscriptions
    ADD CONSTRAINT qbo_report_subscriptions_organization_target_ck
    CHECK (target_type <> 'organization' OR target_id = organization_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS qbo_report_subscriptions_identity_uidx
  ON public.qbo_report_subscriptions (
    organization_id,
    target_type,
    target_id,
    recipient_email
  );

CREATE INDEX IF NOT EXISTS qbo_report_subscriptions_cadence_idx
  ON public.qbo_report_subscriptions (frequency, organization_id);

DROP TRIGGER IF EXISTS trg_qbo_report_subscriptions_updated_at
  ON public.qbo_report_subscriptions;
CREATE TRIGGER trg_qbo_report_subscriptions_updated_at
  BEFORE UPDATE ON public.qbo_report_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.qbo_report_preference_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL
    REFERENCES public.qbo_report_subscriptions(id) ON DELETE RESTRICT,
  previous_frequency text NOT NULL,
  frequency text NOT NULL,
  source text NOT NULL DEFAULT 'report_service',
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.qbo_report_preference_events
    ADD CONSTRAINT qbo_report_preference_events_previous_frequency_ck
    CHECK (previous_frequency IN ('weekly', 'monthly', 'off'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.qbo_report_preference_events
    ADD CONSTRAINT qbo_report_preference_events_frequency_ck
    CHECK (frequency IN ('weekly', 'monthly', 'off'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.qbo_report_preference_events
    ADD CONSTRAINT qbo_report_preference_events_source_ck
    CHECK (source IN ('public_link', 'report_service', 'superadmin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS qbo_report_preference_events_subscription_idx
  ON public.qbo_report_preference_events (subscription_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.guard_qbo_report_preference_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'QBO report preference history is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_qbo_report_preference_event_mutation
  ON public.qbo_report_preference_events;
CREATE TRIGGER trg_guard_qbo_report_preference_event_mutation
  BEFORE UPDATE OR DELETE ON public.qbo_report_preference_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_qbo_report_preference_event_mutation();

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

ALTER TABLE public.qbo_report_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qbo_report_preference_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qbo_report_subscriptions_service_all
  ON public.qbo_report_subscriptions;
CREATE POLICY qbo_report_subscriptions_service_all
  ON public.qbo_report_subscriptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS qbo_report_subscriptions_superadmin_select
  ON public.qbo_report_subscriptions;
CREATE POLICY qbo_report_subscriptions_superadmin_select
  ON public.qbo_report_subscriptions
  FOR SELECT TO authenticated USING (public.is_superadmin());

DROP POLICY IF EXISTS qbo_report_preference_events_service_all
  ON public.qbo_report_preference_events;
CREATE POLICY qbo_report_preference_events_service_all
  ON public.qbo_report_preference_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS qbo_report_preference_events_superadmin_select
  ON public.qbo_report_preference_events;
CREATE POLICY qbo_report_preference_events_superadmin_select
  ON public.qbo_report_preference_events
  FOR SELECT TO authenticated USING (public.is_superadmin());

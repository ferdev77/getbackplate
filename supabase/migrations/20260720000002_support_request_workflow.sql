-- Superadmin workflow and immutable history for public support/privacy requests.

ALTER TABLE public.support_requests
  ADD COLUMN IF NOT EXISTS internal_notes text;

CREATE INDEX IF NOT EXISTS support_requests_assigned_status_created_idx
  ON public.support_requests (assigned_to, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.support_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  support_request_id uuid NOT NULL REFERENCES public.support_requests(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('created', 'status_changed', 'assignment_changed', 'notes_updated', 'verification_changed')),
  previous_value jsonb,
  next_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_request_events_request_created_idx
  ON public.support_request_events (support_request_id, created_at DESC);

ALTER TABLE public.support_request_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS support_request_events_superadmin_select ON public.support_request_events;
CREATE POLICY support_request_events_superadmin_select ON public.support_request_events
  FOR SELECT TO authenticated USING (public.is_superadmin());
DROP POLICY IF EXISTS support_request_events_service_all ON public.support_request_events;
CREATE POLICY support_request_events_service_all ON public.support_request_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.support_request_events (support_request_id, event_type, next_value, created_at)
SELECT request.id, 'created', jsonb_build_object('status', request.status), request.created_at
FROM public.support_requests request
WHERE NOT EXISTS (
  SELECT 1 FROM public.support_request_events event
  WHERE event.support_request_id = request.id AND event.event_type = 'created'
);

CREATE OR REPLACE FUNCTION public.record_support_request_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.support_request_events (support_request_id, event_type, next_value, created_at)
  VALUES (NEW.id, 'created', jsonb_build_object('status', NEW.status), NEW.created_at);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_request_created ON public.support_requests;
CREATE TRIGGER trg_support_request_created
  AFTER INSERT ON public.support_requests
  FOR EACH ROW EXECUTE FUNCTION public.record_support_request_created();

CREATE OR REPLACE FUNCTION public.manage_support_request(
  p_request_id uuid,
  p_action text,
  p_value text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  previous_request public.support_requests%ROWTYPE;
  updated_request public.support_requests%ROWTYPE;
  target_assignee uuid;
  event_name text;
  previous_value jsonb;
  next_value jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Superadmin access required';
  END IF;

  SELECT * INTO previous_request
  FROM public.support_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Support request not found';
  END IF;

  CASE p_action
    WHEN 'status' THEN
      IF p_value IS NULL OR p_value NOT IN ('open', 'verifying', 'in_progress', 'resolved', 'rejected') THEN
        RAISE EXCEPTION 'Invalid support request status';
      END IF;
      IF previous_request.request_type <> 'support'
         AND p_value IN ('in_progress', 'resolved')
         AND previous_request.verified_at IS NULL THEN
        RAISE EXCEPTION 'Identity verification is required before processing this privacy request';
      END IF;
      UPDATE public.support_requests
      SET status = p_value,
          resolved_at = CASE
            WHEN p_value IN ('resolved', 'rejected') THEN COALESCE(resolved_at, now())
            ELSE NULL
          END
      WHERE id = p_request_id
      RETURNING * INTO updated_request;
      event_name := 'status_changed';
      previous_value := jsonb_build_object('status', previous_request.status);
      next_value := jsonb_build_object('status', updated_request.status);

    WHEN 'assignment' THEN
      IF p_value IS NULL OR btrim(p_value) = '' THEN
        target_assignee := NULL;
      ELSE
        BEGIN
          target_assignee := p_value::uuid;
        EXCEPTION WHEN invalid_text_representation THEN
          RAISE EXCEPTION 'Invalid assignee';
        END;
        IF NOT EXISTS (SELECT 1 FROM public.superadmin_users WHERE user_id = target_assignee) THEN
          RAISE EXCEPTION 'Assignee is not a superadmin';
        END IF;
      END IF;
      UPDATE public.support_requests SET assigned_to = target_assignee
      WHERE id = p_request_id RETURNING * INTO updated_request;
      event_name := 'assignment_changed';
      previous_value := jsonb_build_object('assigned_to', previous_request.assigned_to);
      next_value := jsonb_build_object('assigned_to', updated_request.assigned_to);

    WHEN 'notes' THEN
      IF length(COALESCE(p_value, '')) > 10000 THEN
        RAISE EXCEPTION 'Support request notes are too long';
      END IF;
      UPDATE public.support_requests SET internal_notes = NULLIF(btrim(COALESCE(p_value, '')), '')
      WHERE id = p_request_id RETURNING * INTO updated_request;
      event_name := 'notes_updated';
      previous_value := jsonb_build_object('had_notes', previous_request.internal_notes IS NOT NULL);
      next_value := jsonb_build_object('has_notes', updated_request.internal_notes IS NOT NULL);

    WHEN 'verification' THEN
      IF p_value NOT IN ('true', 'false') THEN
        RAISE EXCEPTION 'Invalid verification value';
      END IF;
      UPDATE public.support_requests
      SET verified_at = CASE WHEN p_value = 'true' THEN COALESCE(verified_at, now()) ELSE NULL END
      WHERE id = p_request_id RETURNING * INTO updated_request;
      event_name := 'verification_changed';
      previous_value := jsonb_build_object('verified', previous_request.verified_at IS NOT NULL);
      next_value := jsonb_build_object('verified', updated_request.verified_at IS NOT NULL);

    ELSE
      RAISE EXCEPTION 'Invalid support request action';
  END CASE;

  INSERT INTO public.support_request_events (
    support_request_id, actor_id, event_type, previous_value, next_value
  ) VALUES (
    p_request_id, auth.uid(), event_name, previous_value, next_value
  );

  RETURN to_jsonb(updated_request);
END;
$$;

REVOKE ALL ON FUNCTION public.manage_support_request(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manage_support_request(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.manage_support_request(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

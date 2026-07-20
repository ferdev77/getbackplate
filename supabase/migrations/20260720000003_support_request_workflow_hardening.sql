-- Enforce the support/privacy workflow even against direct authenticated writes.

DROP POLICY IF EXISTS support_requests_superadmin_all ON public.support_requests;
DROP POLICY IF EXISTS support_requests_superadmin_select ON public.support_requests;
CREATE POLICY support_requests_superadmin_select ON public.support_requests
  FOR SELECT TO authenticated USING (public.is_superadmin());

DROP POLICY IF EXISTS support_request_events_superadmin_select ON public.support_request_events;
CREATE POLICY support_request_events_superadmin_select ON public.support_request_events
  FOR SELECT TO authenticated USING (public.is_superadmin());

CREATE UNIQUE INDEX IF NOT EXISTS support_request_events_one_created_idx
  ON public.support_request_events (support_request_id)
  WHERE event_type = 'created';

ALTER TABLE public.support_request_events
  DROP CONSTRAINT IF EXISTS support_request_events_support_request_id_fkey;
ALTER TABLE public.support_request_events
  ADD CONSTRAINT support_request_events_support_request_id_fkey
  FOREIGN KEY (support_request_id) REFERENCES public.support_requests(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.guard_support_request_workflow_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Support requests cannot be deleted';
  END IF;
  IF (
    OLD.status IS DISTINCT FROM NEW.status
    OR OLD.verified_at IS DISTINCT FROM NEW.verified_at
    OR OLD.resolved_at IS DISTINCT FROM NEW.resolved_at
    OR OLD.assigned_to IS DISTINCT FROM NEW.assigned_to
    OR OLD.internal_notes IS DISTINCT FROM NEW.internal_notes
    OR OLD.resolution_notes IS DISTINCT FROM NEW.resolution_notes
  ) AND COALESCE(current_setting('app.support_workflow_rpc', true), '') <> 'true' THEN
    RAISE EXCEPTION 'Support workflow fields must be changed through manage_support_request';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_support_request_workflow_write ON public.support_requests;
CREATE TRIGGER trg_guard_support_request_workflow_write
  BEFORE UPDATE OR DELETE ON public.support_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_support_request_workflow_write();

CREATE OR REPLACE FUNCTION public.guard_support_request_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Support request history is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_support_request_event_mutation ON public.support_request_events;
CREATE TRIGGER trg_guard_support_request_event_mutation
  BEFORE UPDATE OR DELETE ON public.support_request_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_support_request_event_mutation();

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
  normalized_notes text;
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
  IF NOT FOUND THEN RAISE EXCEPTION 'Support request not found'; END IF;

  PERFORM set_config('app.support_workflow_rpc', 'true', true);

  CASE p_action
    WHEN 'status' THEN
      IF p_value IS NULL OR p_value NOT IN ('open', 'verifying', 'in_progress', 'resolved', 'rejected') THEN
        RAISE EXCEPTION 'Invalid support request status';
      END IF;
      IF p_value = previous_request.status THEN RETURN to_jsonb(previous_request); END IF;
      IF previous_request.request_type <> 'support'
         AND p_value IN ('in_progress', 'resolved')
         AND previous_request.verified_at IS NULL THEN
        RAISE EXCEPTION 'Identity verification is required before processing this privacy request';
      END IF;
      UPDATE public.support_requests
      SET status = p_value,
          resolved_at = CASE WHEN p_value IN ('resolved', 'rejected') THEN now() ELSE NULL END
      WHERE id = p_request_id RETURNING * INTO updated_request;
      event_name := 'status_changed';
      previous_value := jsonb_build_object('status', previous_request.status);
      next_value := jsonb_build_object('status', updated_request.status);

    WHEN 'assignment' THEN
      IF p_value IS NULL OR btrim(p_value) = '' THEN
        target_assignee := NULL;
      ELSE
        BEGIN target_assignee := p_value::uuid;
        EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Invalid assignee'; END;
        IF NOT EXISTS (SELECT 1 FROM public.superadmin_users WHERE user_id = target_assignee) THEN
          RAISE EXCEPTION 'Assignee is not a superadmin';
        END IF;
      END IF;
      IF target_assignee IS NOT DISTINCT FROM previous_request.assigned_to THEN RETURN to_jsonb(previous_request); END IF;
      UPDATE public.support_requests SET assigned_to = target_assignee
      WHERE id = p_request_id RETURNING * INTO updated_request;
      event_name := 'assignment_changed';
      previous_value := jsonb_build_object('assigned_to', previous_request.assigned_to);
      next_value := jsonb_build_object('assigned_to', updated_request.assigned_to);

    WHEN 'notes' THEN
      IF length(COALESCE(p_value, '')) > 10000 THEN RAISE EXCEPTION 'Support request notes are too long'; END IF;
      normalized_notes := NULLIF(btrim(COALESCE(p_value, '')), '');
      IF normalized_notes IS NOT DISTINCT FROM previous_request.internal_notes THEN RETURN to_jsonb(previous_request); END IF;
      UPDATE public.support_requests SET internal_notes = normalized_notes
      WHERE id = p_request_id RETURNING * INTO updated_request;
      event_name := 'notes_updated';
      previous_value := jsonb_build_object('had_notes', previous_request.internal_notes IS NOT NULL);
      next_value := jsonb_build_object('has_notes', updated_request.internal_notes IS NOT NULL);

    WHEN 'verification' THEN
      IF p_value NOT IN ('true', 'false') THEN RAISE EXCEPTION 'Invalid verification value'; END IF;
      IF p_value = 'false' AND previous_request.request_type <> 'support'
         AND previous_request.status IN ('in_progress', 'resolved') THEN
        RAISE EXCEPTION 'Verification cannot be removed from a processed privacy request';
      END IF;
      IF (p_value = 'true') = (previous_request.verified_at IS NOT NULL) THEN RETURN to_jsonb(previous_request); END IF;
      UPDATE public.support_requests
      SET verified_at = CASE WHEN p_value = 'true' THEN now() ELSE NULL END
      WHERE id = p_request_id RETURNING * INTO updated_request;
      event_name := 'verification_changed';
      previous_value := jsonb_build_object('verified', previous_request.verified_at IS NOT NULL);
      next_value := jsonb_build_object('verified', updated_request.verified_at IS NOT NULL);

    ELSE
      RAISE EXCEPTION 'Invalid support request action';
  END CASE;

  INSERT INTO public.support_request_events (
    support_request_id, actor_id, event_type, previous_value, next_value
  ) VALUES (p_request_id, auth.uid(), event_name, previous_value, next_value);

  RETURN to_jsonb(updated_request);
END;
$$;

REVOKE ALL ON FUNCTION public.manage_support_request(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manage_support_request(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.manage_support_request(uuid, text, text) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'support_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_requests;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- Record whether requester identity came from a trusted authenticated company session.

ALTER TABLE public.support_requests
  ADD COLUMN IF NOT EXISTS requester_user_id uuid;
ALTER TABLE public.support_requests
  ADD COLUMN IF NOT EXISTS identity_source text NOT NULL DEFAULT 'public';
ALTER TABLE public.support_requests
  ADD COLUMN IF NOT EXISTS authenticated_at timestamptz;

DO $$
BEGIN
  ALTER TABLE public.support_requests
    ADD CONSTRAINT support_requests_identity_source_check
    CHECK (identity_source IN ('public', 'authenticated'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.support_requests
    ADD CONSTRAINT support_requests_identity_evidence_check
    CHECK (
      (identity_source = 'public' AND requester_user_id IS NULL AND authenticated_at IS NULL)
      OR
      (identity_source = 'authenticated' AND requester_user_id IS NOT NULL AND authenticated_at IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS support_requests_requester_user_created_idx
  ON public.support_requests (requester_user_id, created_at DESC)
  WHERE requester_user_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';

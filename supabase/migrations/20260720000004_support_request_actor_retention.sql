-- Preserve historical actor identifiers and require explicit reassignment
-- before an assigned superadmin account can be removed.

ALTER TABLE public.support_requests
  DROP CONSTRAINT IF EXISTS support_requests_assigned_to_fkey;
ALTER TABLE public.support_requests
  ADD CONSTRAINT support_requests_assigned_to_fkey
  FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE public.support_request_events
  DROP CONSTRAINT IF EXISTS support_request_events_actor_id_fkey;

NOTIFY pgrst, 'reload schema';

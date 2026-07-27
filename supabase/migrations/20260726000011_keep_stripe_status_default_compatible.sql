-- Keep compatibility with older application instances during rolling deploys.
-- The new webhook writes `processing` explicitly; old instances continue to
-- reserve rows as `processed` until the code rollout finishes.
alter table public.stripe_processed_events
  alter column status set default 'processed';

notify pgrst, 'reload schema';

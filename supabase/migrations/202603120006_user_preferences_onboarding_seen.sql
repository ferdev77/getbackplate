alter table public.user_preferences
  add column if not exists onboarding_seen_at timestamptz;

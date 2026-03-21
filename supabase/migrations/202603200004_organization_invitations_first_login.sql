alter table public.organization_invitations
  add column if not exists first_login_completed_at timestamptz null,
  add column if not exists first_login_user_id uuid null references auth.users(id);

create index if not exists idx_org_invitations_first_login
  on public.organization_invitations (organization_id, first_login_completed_at);

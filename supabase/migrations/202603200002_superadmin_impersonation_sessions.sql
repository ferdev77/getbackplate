create table if not exists public.superadmin_impersonation_sessions (
  id uuid primary key,
  superadmin_user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reason text null,
  expires_at timestamptz not null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_superadmin_impersonation_user
  on public.superadmin_impersonation_sessions (superadmin_user_id, created_at desc);

create index if not exists idx_superadmin_impersonation_org
  on public.superadmin_impersonation_sessions (organization_id, created_at desc);

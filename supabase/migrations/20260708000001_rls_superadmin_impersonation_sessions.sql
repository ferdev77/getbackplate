alter table public.superadmin_impersonation_sessions enable row level security;

create policy superadmin_read_impersonation_sessions
  on public.superadmin_impersonation_sessions for select
  using (public.is_superadmin());

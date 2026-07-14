-- ============================================================
-- Segundo factor por email para company_admin
--
-- Obligatorio para organizaciones con el modulo qbo_r365 activo,
-- opcional (via user_preferences.two_factor_enabled) para el resto.
-- El codigo nunca se guarda en texto plano, solo su hash.
-- ============================================================

create table if not exists public.company_mfa_challenges (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code_hash    text not null,
  attempts     int not null default 0,
  expires_at   timestamptz not null,
  consumed_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists idx_company_mfa_challenges_user_active
  on public.company_mfa_challenges (user_id, created_at desc)
  where consumed_at is null;

-- Housekeeping: nadie necesita desafios vencidos hace mas de un dia.
create index if not exists idx_company_mfa_challenges_expires_at
  on public.company_mfa_challenges (expires_at);

alter table public.company_mfa_challenges enable row level security;

-- Solo el service role (cliente admin del backend) opera esta tabla;
-- no hay acceso directo desde el cliente del navegador.
create policy company_mfa_challenges_no_client_access
  on public.company_mfa_challenges for all
  using (false)
  with check (false);

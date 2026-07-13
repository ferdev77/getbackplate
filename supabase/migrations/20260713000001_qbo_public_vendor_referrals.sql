-- Registro de referidos de vendors enviados desde el formulario PUBLICO
-- (sin token), disponible en /refer para cualquier visitante. A diferencia
-- de qbo_vendor_referrals, estas filas no estan atadas a una organizacion
-- ni a una sucursal ya conectada -- referrer_name es texto libre que el
-- visitante escribe. Insertado exclusivamente via service_role desde
-- /api/refer/public; sin policy de INSERT para anon/authenticated.

create table if not exists public.qbo_public_vendor_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_name text not null,
  vendor_email text not null,
  visitor_ip text,
  user_agent text,
  outreach_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists qbo_public_vendor_referrals_vendor_email_idx
  on public.qbo_public_vendor_referrals (vendor_email);

alter table public.qbo_public_vendor_referrals enable row level security;

drop policy if exists qbo_public_vendor_referrals_superadmin_select on public.qbo_public_vendor_referrals;
create policy qbo_public_vendor_referrals_superadmin_select
  on public.qbo_public_vendor_referrals
  for select
  to authenticated
  using (public.is_superadmin());
